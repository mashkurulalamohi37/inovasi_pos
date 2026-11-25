"""Jewelry vertical — metal rates, profiles, certificates, pricing, buyback."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.inventory.locking import for_update
from app.dependencies import AuthContext, write_audit
from app.models.industry import (
    JewelryBuyback,
    JewelryCertificate,
    JewelryCustomOrder,
    JewelryExchangeCredit,
    JewelryGoldRate,
    JewelryKarigar,
    JewelryKarigarBill,
    JewelryMaterialIssue,
    JewelryMaterialReturn,
    JewelryMeltingLot,
    JewelryOrderAdvance,
    JewelryProductionRecovery,
    JewelryProductProfile,
    JewelryRepairOrder,
    JewelryWorkOperation,
    JewelryWorkOrder,
)
from app.models.product import Product
from app.rbac import role_has_permission

BUYBACK_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"assessed", "cancelled"},
    "assessed": {"approved", "cancelled", "draft"},
    "approved": {"settled", "cancelled"},
    "settled": set(),
    "cancelled": set(),
}

VALID_KARATS = {"24K", "22K", "21K", "18K", "14K", "10K", "999", "925", "950"}

# Upper bound for a posted metal rate, in BDT per gram. Well clear of any real
# gold price but low enough to catch a slipped digit before it reaches the tills.
MAX_METAL_RATE_PER_GRAM = 1_000_000.0


GRAMS_PER_BHORI = 11.664

KARAT_PURITY_MAP: dict[str, float] = {
    "24K": 1.0,
    "22K": 22.0 / 24.0,  # ~0.916667
    "21K": 21.0 / 24.0,  # 0.875
    "18K": 18.0 / 24.0,  # 0.75
    "14K": 14.0 / 24.0,  # ~0.583333
    "10K": 10.0 / 24.0,  # ~0.416667
    "999": 0.999,
    "925": 0.925,
    "950": 0.950,
}


def get_purity_factor(karat: str | None) -> float:
    k = normalize_karat(karat)
    return KARAT_PURITY_MAP.get(k, 0.916667)


def calculate_fine_gold_weight(net_weight: float, karat: str | None) -> float:
    factor = get_purity_factor(karat)
    return round(net_weight * factor, 4)


def grams_to_bhori(grams: float) -> dict[str, Any]:
    """Convert grams to traditional Bangladeshi units: Bhori, Ana, Roti, Point."""
    if grams <= 0:
        return {
            "grams": 0.0,
            "total_bhori": 0.0,
            "bhori": 0,
            "ana": 0,
            "roti": 0,
            "point": 0.0,
            "display_en": "0 Bhori",
            "display_bn": "০ ভরি",
        }
    total_bhori = grams / GRAMS_PER_BHORI
    bhori = int(total_bhori)
    rem_bhori = total_bhori - bhori

    total_ana = rem_bhori * 16.0
    ana = int(total_ana)
    rem_ana = total_ana - ana

    total_roti = rem_ana * 6.0
    roti = int(total_roti)
    rem_roti = total_roti - roti

    point = round(rem_roti * 10.0, 1)

    parts_en: list[str] = []
    if bhori > 0:
        parts_en.append(f"{bhori} Bhori")
    if ana > 0:
        parts_en.append(f"{ana} Ana")
    if roti > 0:
        parts_en.append(f"{roti} Roti")
    if point > 0:
        parts_en.append(f"{point} Point")
    display_en = " ".join(parts_en) if parts_en else f"{round(total_bhori, 4)} Bhori"

    return {
        "grams": round(grams, 4),
        "total_bhori": round(total_bhori, 4),
        "bhori": bhori,
        "ana": ana,
        "roti": roti,
        "point": point,
        "display_en": display_en,
    }


def bhori_to_grams(bhori: float = 0, ana: float = 0, roti: float = 0, point: float = 0) -> float:
    total_bhori = bhori + (ana / 16.0) + (roti / 96.0) + (point / 960.0)
    return round(total_bhori * GRAMS_PER_BHORI, 4)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_karat(raw: str | None, *, default: str = "22K") -> str:
    value = str(raw or default).strip().upper()
    if value in {"999", "925", "950"}:
        return value
    if value.endswith("K"):
        k_num = value[:-1]
        if k_num in {"999", "925", "950"}:
            return k_num
        if k_num in {"24", "22", "21", "18", "14", "10"}:
            return value
    elif value.isdigit() and value in {"24", "22", "21", "18", "14", "10"}:
        return f"{value}K"
    elif value in VALID_KARATS:
        return value
    raise HTTPException(
        status_code=400,
        detail=f"Invalid purity/karat '{raw}'. Allowed: {', '.join(sorted(VALID_KARATS))}",
    )


def _next_no(session: Session, company_id: str, prefix: str, model, field: str) -> str:
    """Next document number for a tenant, derived from the highest one issued.

    Counting rows was wrong twice over: cancelling a ticket freed its ordinal and
    the next insert reissued it, and every call loaded the tenant's whole history
    to produce one integer. Reading the max keeps numbers monotonic and stable
    under deletion; the caller still holds the transaction that makes it unique.
    """
    column = getattr(model, field)
    highest = session.exec(
        select(column)
        .where(model.company_id == company_id, column.like(f"{prefix}-%"))
        .order_by(column.desc())
        .limit(1)
    ).first()
    ordinal = 0
    if highest:
        tail = str(highest).rsplit("-", 1)[-1]
        if tail.isdigit():
            ordinal = int(tail)
    return f"{prefix}-{ordinal + 1:06d}"


def calculate_jewelry_price(
    *,
    net_metal_weight: float,
    metal_rate: float,
    making_charge_type: str = "per_gram",
    making_charge_rate: float = 0,
    making_charge_amount: float = 0,
    wastage_percentage: float = 0,
    stone_value: float = 0,
    other_charge: float = 0,
    discount_amount: float = 0,
    tax_rate: float = 0.05,
) -> dict[str, float]:
    metal_value = round(net_metal_weight * metal_rate, 2)
    if making_charge_type == "fixed":
        making = round(making_charge_amount or making_charge_rate, 2)
    elif making_charge_type == "percent":
        making = round(metal_value * ((making_charge_rate or 0) / 100.0), 2)
    else:
        making = round(net_metal_weight * (making_charge_rate or making_charge_amount or 0), 2)
    wastage_value = round(metal_value * ((wastage_percentage or 0) / 100.0), 2)
    stone = round(stone_value or 0, 2)
    other = round(other_charge or 0, 2)
    gross = round(metal_value + making + wastage_value + stone + other, 2)
    discount = round(min(discount_amount or 0, gross), 2)
    taxable = round(gross - discount, 2)
    tax_amount = round(taxable * (tax_rate or 0), 2)
    net = round(taxable + tax_amount, 2)
    return {
        "metal_value": metal_value,
        "making_charge": making,
        "wastage_value": wastage_value,
        "stone_value": stone,
        "other_charge": other,
        "gross_amount": gross,
        "discount_amount": discount,
        "tax_amount": tax_amount,
        "net_amount": net,
    }


def _rate_out(row: JewelryGoldRate) -> dict[str, Any]:
    selling = row.selling_rate if row.selling_rate is not None else row.rate_per_gram
    buying = row.buying_rate if row.buying_rate is not None else round(selling * 0.92, 2)
    return {
        "id": row.id,
        "metal_type": row.metal_type or "Gold",
        "karat": row.karat,
        "purity": row.purity or row.karat,
        "rate_per_gram": selling,
        "selling_rate": selling,
        "buying_rate": buying,
        "currency": row.currency or "BDT",
        "unit_basis": row.unit_basis or "gram",
        "status": row.status or "active",
        "effective_date": row.effective_date.isoformat() if row.effective_date else None,
        "created_by": row.created_by,
        "approved_by": row.approved_by,
        "override_reason": row.override_reason,
        "previous_rate": row.previous_rate,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_metal_rates(
    session: Session,
    company_id: str,
    *,
    metal_type: str | None = None,
    karat: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    stmt = select(JewelryGoldRate).where(JewelryGoldRate.company_id == company_id)
    if metal_type:
        stmt = stmt.where(JewelryGoldRate.metal_type == metal_type)
    if karat:
        stmt = stmt.where(JewelryGoldRate.karat == karat)
    rows = session.exec(stmt.order_by(JewelryGoldRate.effective_date.desc()).limit(limit)).all()  # type: ignore[attr-defined]
    return [_rate_out(r) for r in rows]


def get_effective_rate(
    session: Session,
    company_id: str,
    *,
    metal_type: str = "Gold",
    karat: str = "22K",
    as_of: datetime | None = None,
) -> dict[str, Any]:
    as_of = as_of or _utc_now()
    stmt = (
        select(JewelryGoldRate)
        .where(
            JewelryGoldRate.company_id == company_id,
            JewelryGoldRate.metal_type == metal_type,
            JewelryGoldRate.karat == karat,
            JewelryGoldRate.effective_date <= as_of,
        )
        .order_by(JewelryGoldRate.effective_date.desc())  # type: ignore[attr-defined]
    )
    row = session.exec(stmt).first()
    if not row:
        # fallback any metal/karat
        row = session.exec(
            select(JewelryGoldRate)
            .where(JewelryGoldRate.company_id == company_id)
            .order_by(JewelryGoldRate.effective_date.desc())  # type: ignore[attr-defined]
        ).first()
    if not row:
        return {
            "rate_per_gram": 0.0,
            "selling_rate": 0.0,
            "buying_rate": 0.0,
            "karat": karat,
            "metal_type": metal_type,
            "purity": karat,
            "currency": "BDT",
            "unit_basis": "gram",
            "status": "missing",
            "effective_date": None,
            "id": None,
        }
    return _rate_out(row)


def create_metal_rate(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    if not role_has_permission(auth.role_code, "jewelry.rate_manage"):
        raise HTTPException(status_code=403, detail="jewelry.rate_manage required")
    karat = normalize_karat(str(body.get("karat") or body.get("purity") or "22K"))
    metal_type = str(body.get("metal_type") or "Gold")
    selling = float(body.get("selling_rate") or body.get("rate_per_gram") or 0)
    if selling <= 0:
        raise HTTPException(status_code=400, detail="selling_rate must be positive")
    if selling > MAX_METAL_RATE_PER_GRAM:
        raise HTTPException(
            status_code=400,
            detail=(
                f"selling_rate {selling} exceeds the sanity limit of "
                f"{MAX_METAL_RATE_PER_GRAM}/gram — check for a typo"
            ),
        )
    buying = float(body.get("buying_rate") or round(selling * 0.92, 2))
    # A board rate reaches every terminal the moment it is posted, so reject the
    # shapes that can only be data-entry errors rather than storing them.
    if buying <= 0:
        raise HTTPException(status_code=400, detail="buying_rate must be positive")
    if buying > selling:
        raise HTTPException(
            status_code=400,
            detail=f"buying_rate ({buying}) cannot exceed selling_rate ({selling})",
        )
    previous = get_effective_rate(session, auth.company_id, metal_type=metal_type, karat=karat)
    # Daily rate posts need rate_manage only. Explicit manual_override requires rate_override.
    is_override = bool(body.get("manual_override") or body.get("is_override"))
    if is_override and not role_has_permission(auth.role_code, "jewelry.rate_override"):
        raise HTTPException(status_code=403, detail="jewelry.rate_override required for manual override")
    effective = _utc_now()
    if body.get("effective_date"):
        try:
            effective = datetime.fromisoformat(str(body["effective_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass
    row = JewelryGoldRate(
        company_id=auth.company_id,
        metal_type=metal_type,
        karat=karat,
        purity=str(body.get("purity") or karat),
        rate_per_gram=selling,
        selling_rate=selling,
        buying_rate=buying,
        currency=str(body.get("currency") or "BDT"),
        unit_basis=str(body.get("unit_basis") or "gram"),
        status="active",
        effective_date=effective,
        created_by=auth.user_id,
        # Left unset on purpose: `jewelry.rate_manage` already gates this function,
        # so stamping approved_by from it made every rate self-approved and the
        # column carried no audit value. A separate approval step must fill it.
        approved_by=None,
        override_reason=body.get("override_reason"),
        previous_rate=previous.get("selling_rate") or previous.get("rate_per_gram"),
    )
    session.add(row)
    session.flush()
    write_audit(
        session,
        auth,
        "jewelry_rate_override" if is_override else "jewelry_rate_create",
        "jewelry_gold_rate",
        row.id,
        {
            "metal_type": metal_type,
            "karat": karat,
            "old_rate": row.previous_rate,
            "new_rate": selling,
            "reason": row.override_reason,
        },
    )
    session.flush()
    return _rate_out(row)


def _profile_out(p: JewelryProductProfile, product: Product | None = None) -> dict[str, Any]:
    return {
        "id": p.id,
        "product_id": p.product_id,
        "product_name": product.name if product else None,
        "product_sku": product.sku if product else None,
        "metal_type": p.metal_type,
        "purity": p.purity,
        "karat": p.karat,
        "gross_weight": p.gross_weight,
        "stone_weight": p.stone_weight,
        "other_non_metal_weight": p.other_non_metal_weight,
        "net_metal_weight": p.net_metal_weight,
        "fine_weight": p.fine_weight,
        "making_charge_type": p.making_charge_type,
        "making_charge_rate": p.making_charge_rate,
        "making_charge_amount": p.making_charge_amount,
        "wastage_percentage": p.wastage_percentage,
        "default_stone_value": p.default_stone_value,
        "certificate_required": p.certificate_required,
        "tag_no": p.tag_no,
        "barcode": p.barcode,
        "attributes_json": p.attributes_json,
        "is_active": p.is_active,
    }


def validate_weights(*, gross: float, stone: float, other: float = 0, net: float | None = None) -> float:
    if gross <= 0:
        raise HTTPException(status_code=400, detail="gross_weight must be greater than 0")
    if stone < 0 or other < 0:
        raise HTTPException(status_code=400, detail="weights cannot be negative")
    if stone > gross:
        raise HTTPException(status_code=400, detail="stone_weight cannot exceed gross_weight")
    computed = round(gross - stone - other, 4)
    if computed < 0:
        raise HTTPException(status_code=400, detail="net_metal_weight cannot be negative")
    if net is None:
        return computed
    if net < 0:
        raise HTTPException(status_code=400, detail="net_metal_weight cannot be negative")
    # The metal charge is net × rate, so an unbounded net is a direct over-billing
    # vector: a 10g bangle could be priced as 10kg of gold. Tolerate float noise
    # only — anything above the physical maximum is rejected outright.
    if net - computed > 0.001:
        raise HTTPException(
            status_code=400,
            detail=(
                f"net_metal_weight ({net}g) cannot exceed gross_weight minus "
                f"stone and other non-metal weight ({computed}g)"
            ),
        )
    return net


def upsert_product_profile(session: Session, auth: AuthContext, product_id: str, body: dict[str, Any]) -> dict[str, Any]:
    if not role_has_permission(auth.role_code, "jewelry.manage"):
        raise HTTPException(status_code=403, detail="jewelry.manage required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "jewelry":
        raise HTTPException(status_code=400, detail="Product is not a jewelry item")
    # The back-office form historically posted the `_grams` spellings while this
    # service only read the bare ones, so gross resolved to 0 and every save was
    # rejected as "gross_weight must be greater than 0". Accept both.
    gross = float(body.get("gross_weight") or body.get("gross_weight_grams") or 0)
    stone = float(body.get("stone_weight") or body.get("stone_weight_grams") or 0)
    other = float(body.get("other_non_metal_weight") or 0)
    net = validate_weights(
        gross=gross,
        stone=stone,
        other=other,
        net=float(body["net_metal_weight"]) if body.get("net_metal_weight") is not None else None,
    )
    purity = normalize_karat(str(body.get("purity") or body.get("karat") or "22K"))
    karat = purity
    # `certificate_no` is the form's name for the hallmark tag; it used to be
    # dropped silently, leaving saved profiles with no certificate reference.
    tag_no = (body.get("tag_no") or body.get("certificate_no") or "").strip() or None
    barcode = (body.get("barcode") or "").strip() or None
    if tag_no:
        dup = session.exec(
            select(JewelryProductProfile).where(
                JewelryProductProfile.company_id == auth.company_id,
                JewelryProductProfile.tag_no == tag_no,
                JewelryProductProfile.product_id != product_id,
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail=f"Duplicate tag_no: {tag_no}")
    profile = session.exec(
        select(JewelryProductProfile).where(
            JewelryProductProfile.company_id == auth.company_id,
            JewelryProductProfile.product_id == product_id,
        )
    ).first()
    if not profile:
        profile = JewelryProductProfile(company_id=auth.company_id, product_id=product_id)
    profile.metal_type = str(body.get("metal_type") or "Gold")
    profile.purity = purity
    profile.karat = karat
    profile.gross_weight = gross
    profile.stone_weight = stone
    profile.other_non_metal_weight = other
    profile.net_metal_weight = net
    profile.fine_weight = float(body["fine_weight"]) if body.get("fine_weight") is not None else None
    profile.making_charge_type = str(body.get("making_charge_type") or "per_gram")
    profile.making_charge_rate = float(body.get("making_charge_rate") or 0)
    profile.making_charge_amount = float(body.get("making_charge_amount") or 0)
    profile.wastage_percentage = float(body.get("wastage_percentage") or 0)
    profile.default_stone_value = float(body.get("default_stone_value") or 0)
    profile.certificate_required = bool(body.get("certificate_required") or False)
    profile.tag_no = tag_no
    profile.barcode = barcode
    if body.get("attributes") is not None:
        profile.attributes_json = json.dumps(body.get("attributes"))
    elif body.get("attributes_json") is not None:
        profile.attributes_json = body.get("attributes_json")
    if body.get("is_active") is not None:
        profile.is_active = bool(body.get("is_active"))
    session.add(profile)
    # sync meta_json for POS catalog
    meta: dict[str, Any] = {}
    if product.meta_json:
        try:
            meta = json.loads(product.meta_json)
        except json.JSONDecodeError:
            meta = {}
    meta.update({
        "metal": profile.metal_type,
        "karat": int(str(profile.karat).replace("K", "")) if str(profile.karat).replace("K", "").isdigit() else profile.karat,
        "purity": profile.purity,
        "gross_weight": profile.gross_weight,
        "grossWeight": profile.gross_weight,
        "stone_weight": profile.stone_weight,
        "stoneWeight": profile.stone_weight,
        "net_weight": profile.net_metal_weight,
        "netWeight": profile.net_metal_weight,
        "net_metal_weight": profile.net_metal_weight,
        "making_charge_type": profile.making_charge_type,
        "making_charge_rate": profile.making_charge_rate,
        "makingChargePerGram": profile.making_charge_rate if profile.making_charge_type == "per_gram" else 0,
        "wastage_percentage": profile.wastage_percentage,
        "default_stone_value": profile.default_stone_value,
        "certificate": profile.tag_no or "",
        "tag_no": profile.tag_no,
        "certificate_required": profile.certificate_required,
    })
    product.meta_json = json.dumps(meta)
    session.add(product)
    session.flush()
    write_audit(session, auth, "jewelry_profile_upsert", "jewelry_product_profile", profile.id)
    session.flush()
    return _profile_out(profile, product)


def get_product_profile(session: Session, company_id: str, product_id: str) -> dict[str, Any] | None:
    profile = session.exec(
        select(JewelryProductProfile).where(
            JewelryProductProfile.company_id == company_id,
            JewelryProductProfile.product_id == product_id,
        )
    ).first()
    if not profile:
        return None
    product = session.get(Product, product_id)
    return _profile_out(profile, product)


def list_profiles(
    session: Session,
    company_id: str,
    *,
    karat: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    stmt = (
        select(JewelryProductProfile, Product)
        .join(Product, JewelryProductProfile.product_id == Product.id)
        .where(JewelryProductProfile.company_id == company_id)
    )
    if karat:
        stmt = stmt.where(JewelryProductProfile.karat == normalize_karat(karat))
    rows = session.exec(stmt).all()
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for profile, product in rows:
        row = _profile_out(profile, product)
        if q_lower:
            hay = f"{product.sku} {product.name} {profile.tag_no or ''} {profile.barcode or ''}".lower()
            if q_lower not in hay:
                continue
        out.append(row)
    return out


def _cert_out(c: JewelryCertificate, product: Product | None = None) -> dict[str, Any]:
    return {
        "id": c.id,
        "certificate_no": c.certificate_no or c.cert_no,
        "cert_no": c.cert_no,
        "product_id": c.product_id,
        "product_name": product.name if product else None,
        "product_sku": product.sku if product else None,
        "tag_no": c.tag_no,
        "barcode": c.barcode,
        "metal_type": c.metal_type,
        "purity": c.purity,
        "weight_gram": c.weight_gram,
        "gross_weight": c.gross_weight or c.weight_gram,
        "stone_weight": c.stone_weight,
        "net_metal_weight": c.net_metal_weight or c.weight_gram,
        "stone_details_json": c.stone_details_json,
        "issue_date": c.issue_date.isoformat() if c.issue_date else None,
        "status": c.status or "active",
        "sales_invoice_id": c.sales_invoice_id,
        "customer_id": c.customer_id,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def list_certificates(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(JewelryCertificate).where(JewelryCertificate.company_id == company_id)
    if status:
        stmt = stmt.where(JewelryCertificate.status == status)
    rows = session.exec(stmt.order_by(JewelryCertificate.created_at.desc())).all()  # type: ignore[attr-defined]
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for c in rows:
        product = session.get(Product, c.product_id)
        row = _cert_out(c, product)
        if q_lower:
            hay = f"{row['certificate_no']} {row['tag_no'] or ''} {row['product_name'] or ''}".lower()
            if q_lower not in hay:
                continue
        out.append(row)
    return out


def create_certificate(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    if not role_has_permission(auth.role_code, "jewelry.certificate_manage"):
        raise HTTPException(status_code=403, detail="jewelry.certificate_manage required")
    product_id = body.get("product_id")
    product = session.get(Product, product_id) if product_id else None
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    cert_no = str(body.get("certificate_no") or body.get("cert_no") or "").strip()
    if not cert_no:
        cert_no = _next_no(session, auth.company_id, "CERT", JewelryCertificate, "cert_no")
    existing = session.exec(
        select(JewelryCertificate).where(
            JewelryCertificate.company_id == auth.company_id,
            JewelryCertificate.cert_no == cert_no,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Duplicate certificate: {cert_no}")
    gross = float(body.get("gross_weight") or body.get("weight_gram") or 0)
    stone = float(body.get("stone_weight") or 0)
    net = float(body.get("net_metal_weight") or max(0, gross - stone))
    if gross > 0:
        validate_weights(gross=gross, stone=stone, net=net)
    row = JewelryCertificate(
        company_id=auth.company_id,
        product_id=product.id,
        cert_no=cert_no,
        certificate_no=cert_no,
        tag_no=(body.get("tag_no") or "").strip() or None,
        barcode=(body.get("barcode") or "").strip() or None,
        metal_type=str(body.get("metal_type") or "Gold"),
        purity=normalize_karat(str(body.get("purity") or "22K")),
        weight_gram=net or gross,
        gross_weight=gross,
        stone_weight=stone,
        net_metal_weight=net,
        stone_details_json=body.get("stone_details_json") or (
            json.dumps(body["stone_details"]) if body.get("stone_details") else None
        ),
        issue_date=_utc_now(),
        status="active",
        created_by=auth.user_id,
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "jewelry_certificate_create", "jewelry_certificate", row.id)
    session.flush()
    return _cert_out(row, product)


def find_certificate(session: Session, company_id: str, code: str) -> JewelryCertificate | None:
    code = code.strip()
    return session.exec(
        select(JewelryCertificate).where(
            JewelryCertificate.company_id == company_id,
            (JewelryCertificate.cert_no == code)
            | (JewelryCertificate.certificate_no == code)
            | (JewelryCertificate.tag_no == code)
            | (JewelryCertificate.barcode == code),
        )
    ).first()


def mark_certificate_sold(
    session: Session,
    auth: AuthContext,
    *,
    certificate_id: str | None,
    certificate_no: str | None,
    invoice_id: str,
    customer_id: str | None,
) -> JewelryCertificate | None:
    row = None
    if certificate_id:
        row = session.exec(
            for_update(session, select(JewelryCertificate).where(JewelryCertificate.id == certificate_id))
        ).first()
    elif certificate_no:
        row = session.exec(
            for_update(
                session,
                select(JewelryCertificate).where(
                    JewelryCertificate.company_id == auth.company_id,
                    JewelryCertificate.cert_no == certificate_no,
                ),
            )
        ).first()
    if not row or row.company_id != auth.company_id:
        return None
    if row.status == "sold":
        raise ValueError(f"Certificate already sold: {row.cert_no}")
    if row.status not in {"active", "returned", "exchanged"}:
        raise ValueError(f"Certificate not sellable: {row.cert_no} ({row.status})")
    row.status = "sold"
    row.sales_invoice_id = invoice_id
    row.customer_id = customer_id
    session.add(row)
    return row


def update_certificate_status(
    session: Session,
    company_id: str,
    certificate_id: str | None,
    certificate_no: str | None,
    status: str,
) -> None:
    row = None
    if certificate_id:
        row = session.get(JewelryCertificate, certificate_id)
    elif certificate_no:
        row = find_certificate(session, company_id, certificate_no)
    if row and row.company_id == company_id:
        row.status = status
        session.add(row)


def quote_sale_line(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    product_id = body.get("product_id")
    product = session.get(Product, product_id) if product_id else None
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.is_active:
        raise HTTPException(status_code=400, detail="Inactive product cannot be sold")
    profile = get_product_profile(session, auth.company_id, product.id) or {}
    metal_type = str(body.get("metal_type") or profile.get("metal_type") or "Gold")
    karat = normalize_karat(str(body.get("karat") or body.get("purity") or profile.get("karat") or "22K"))
    rate_info = get_effective_rate(session, auth.company_id, metal_type=metal_type, karat=karat)
    if not rate_info.get("id") or float(rate_info.get("selling_rate") or 0) <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"No metal rate configured for {metal_type} {karat}. Post a rate before quoting.",
        )
    metal_rate = float(body.get("metal_rate") or body.get("gold_rate") or rate_info["selling_rate"])
    if body.get("metal_rate") or body.get("gold_rate"):
        if abs(metal_rate - float(rate_info["selling_rate"])) > 0.01:
            if not role_has_permission(auth.role_code, "jewelry.rate_override"):
                raise HTTPException(status_code=403, detail="jewelry.rate_override required to override rate")
            if not body.get("rate_override_reason"):
                raise HTTPException(status_code=400, detail="rate_override_reason required")
    cert_no = body.get("certificate_no") or body.get("certificate")
    cert: JewelryCertificate | None = None
    # Enforce certificate_required only when explicitly selling (or caller asks).
    enforce_cert = bool(body.get("enforce_certificate") or body.get("for_sale"))
    if enforce_cert and profile.get("certificate_required") and not cert_no:
        raise HTTPException(status_code=400, detail="certificate_no required for this jewelry product")
    if cert_no:
        cert = find_certificate(session, auth.company_id, str(cert_no))
        if not cert:
            raise HTTPException(status_code=404, detail=f"Certificate not found: {cert_no}")
        if cert.status == "sold":
            raise HTTPException(status_code=409, detail=f"Certificate already sold: {cert_no}")
        if cert.status not in {"active", "returned", "exchanged"}:
            raise HTTPException(status_code=400, detail=f"Certificate not sellable: {cert_no}")
        if cert.product_id and cert.product_id != product.id:
            raise HTTPException(status_code=400, detail="Certificate does not match product")
    net = float(
        body.get("net_metal_weight")
        or body.get("net_weight")
        or (cert.net_metal_weight if cert and cert.net_metal_weight else None)
        or profile.get("net_metal_weight")
        or 0
    )
    if net <= 0:
        raise HTTPException(status_code=400, detail="net_metal_weight required")
    # A caller may quote a measured weight (loose stock has no tagged profile), but
    # where the item IS tagged or certified, that record caps what can be charged —
    # otherwise a posted net weight prices a 10g bangle as 10kg of gold.
    weight_ceiling = float(
        (cert.gross_weight if cert and cert.gross_weight else None)
        or profile.get("gross_weight")
        or 0
    )
    if weight_ceiling > 0 and net - weight_ceiling > 0.001:
        raise HTTPException(
            status_code=400,
            detail=(
                f"net_metal_weight ({net}g) exceeds the recorded gross weight "
                f"for this item ({weight_ceiling}g)"
            ),
        )
    gross = float(
        body.get("gross_weight")
        or (cert.gross_weight if cert and cert.gross_weight else None)
        or profile.get("gross_weight")
        or 0
    )
    stone_wt = float(
        body.get("stone_weight")
        or (cert.stone_weight if cert and cert.stone_weight is not None else None)
        or profile.get("stone_weight")
        or 0
    )
    making_type = str(body.get("making_charge_type") or profile.get("making_charge_type") or "per_gram")
    making_rate = float(body.get("making_charge_rate") or profile.get("making_charge_rate") or 0)
    making_amount = float(body.get("making_charge_amount") or profile.get("making_charge_amount") or 0)
    wastage = float(body.get("wastage_percentage") or profile.get("wastage_percentage") or 0)
    stone_value = float(body.get("stone_value") or profile.get("default_stone_value") or 0)
    breakdown = calculate_jewelry_price(
        net_metal_weight=net,
        metal_rate=metal_rate,
        making_charge_type=making_type,
        making_charge_rate=making_rate,
        making_charge_amount=making_amount,
        wastage_percentage=wastage,
        stone_value=stone_value,
        other_charge=float(body.get("other_charge") or 0),
        discount_amount=float(body.get("discount_amount") or 0),
        tax_rate=float(body.get("tax_rate") if body.get("tax_rate") is not None else 0.05),
    )
    return {
        "product_id": product.id,
        "metal_type": metal_type,
        "purity": karat,
        "karat": karat,
        "gross_weight": gross,
        "stone_weight": stone_wt,
        "net_metal_weight": net,
        "metal_rate": metal_rate,
        "rate_source": rate_info.get("id"),
        "rate_effective_date": rate_info.get("effective_date"),
        "making_charge_type": making_type,
        "making_charge_rate": making_rate,
        "wastage_percentage": wastage,
        "certificate_no": str(cert_no) if cert_no else (profile.get("tag_no") or None),
        "breakdown": breakdown,
        **breakdown,
    }


def _buyback_out(b: JewelryBuyback) -> dict[str, Any]:
    return {
        "id": b.id,
        "buyback_no": b.buyback_no,
        "store_id": b.store_id,
        "customer_id": b.customer_id,
        "customer_name": b.customer_name,
        "original_invoice_id": b.original_invoice_id,
        "original_certificate_id": b.original_certificate_id,
        "metal_type": b.metal_type,
        "purity": b.purity,
        "gross_weight": b.gross_weight,
        "net_metal_weight": b.net_metal_weight,
        "assessed_purity": b.assessed_purity,
        "assessed_weight": b.assessed_weight,
        "applicable_buy_rate": b.applicable_buy_rate,
        "deductions": b.deductions,
        "stone_deduction": b.stone_deduction,
        "service_deduction": b.service_deduction,
        "final_buyback_value": b.final_buyback_value,
        "settlement_method": b.settlement_method,
        "status": b.status,
        "override_reason": b.override_reason,
        "assessed_by": b.assessed_by,
        "approved_by": b.approved_by,
        "notes": b.notes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def list_buybacks(session: Session, company_id: str, *, status: str | None = None) -> list[dict[str, Any]]:
    stmt = select(JewelryBuyback).where(JewelryBuyback.company_id == company_id)
    if status:
        stmt = stmt.where(JewelryBuyback.status == status)
    rows = session.exec(stmt.order_by(JewelryBuyback.created_at.desc())).all()  # type: ignore[attr-defined]
    return [_buyback_out(r) for r in rows]


def create_buyback(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    if not role_has_permission(auth.role_code, "jewelry.buyback"):
        raise HTTPException(status_code=403, detail="jewelry.buyback required")
    metal_type = str(body.get("metal_type") or "Gold")
    purity = normalize_karat(str(body.get("purity") or "22K"))
    rate = get_effective_rate(session, auth.company_id, metal_type=metal_type, karat=purity)
    buy_rate = float(body.get("applicable_buy_rate") or rate.get("buying_rate") or 0)
    if not rate.get("id") or buy_rate <= 0:
        raise HTTPException(status_code=400, detail=f"No buying rate configured for {metal_type} {purity}")
    if body.get("applicable_buy_rate") is not None and abs(buy_rate - float(rate.get("buying_rate") or 0)) > 0.01:
        if not role_has_permission(auth.role_code, "jewelry.rate_override"):
            raise HTTPException(status_code=403, detail="jewelry.rate_override required")
        if not body.get("override_reason"):
            raise HTTPException(status_code=400, detail="override_reason required for buy rate override")
    net = float(body.get("net_metal_weight") or body.get("assessed_weight") or 0)
    if net <= 0:
        raise HTTPException(status_code=400, detail="net_metal_weight required")
    deductions = float(body.get("deductions") or 0)
    stone_ded = float(body.get("stone_deduction") or 0)
    service_ded = float(body.get("service_deduction") or 0)
    raw = round(net * buy_rate, 2)
    final = round(max(0, raw - deductions - stone_ded - service_ded), 2)
    if body.get("final_buyback_value") is not None:
        if not role_has_permission(auth.role_code, "jewelry.rate_override"):
            raise HTTPException(status_code=403, detail="Override permission required for final value")
        if not body.get("override_reason"):
            raise HTTPException(status_code=400, detail="override_reason required")
        final = float(body["final_buyback_value"])
    original_certificate_id = body.get("original_certificate_id")
    if not original_certificate_id and body.get("certificate_no"):
        cert = find_certificate(session, auth.company_id, str(body["certificate_no"]))
        if cert:
            original_certificate_id = cert.id
    row = JewelryBuyback(
        company_id=auth.company_id,
        buyback_no=_next_no(session, auth.company_id, "BB", JewelryBuyback, "buyback_no"),
        store_id=body.get("store_id") or auth.store_id,
        customer_id=body.get("customer_id"),
        customer_name=str(body.get("customer_name") or ""),
        original_invoice_id=body.get("original_invoice_id"),
        original_certificate_id=original_certificate_id,
        metal_type=metal_type,
        purity=purity,
        gross_weight=float(body.get("gross_weight") or net),
        net_metal_weight=net,
        assessed_purity=body.get("assessed_purity") or purity,
        assessed_weight=float(body.get("assessed_weight") or net),
        applicable_buy_rate=buy_rate,
        deductions=deductions,
        stone_deduction=stone_ded,
        service_deduction=service_ded,
        final_buyback_value=final,
        settlement_method=body.get("settlement_method"),
        status="draft",
        override_reason=body.get("override_reason"),
        notes=body.get("notes"),
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "jewelry_buyback_create", "jewelry_buyback", row.id, {"value": final})
    session.flush()
    return _buyback_out(row)


def update_buyback_status(session: Session, auth: AuthContext, buyback_id: str, body: dict[str, Any]) -> dict[str, Any]:
    row = session.get(JewelryBuyback, buyback_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Buyback not found")
    new_status = str(body.get("status") or "").strip()
    if new_status not in BUYBACK_TRANSITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")
    current = row.status or "draft"
    if new_status != current and new_status not in BUYBACK_TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=400, detail=f"Cannot transition from {current} to {new_status}")
    if new_status == "approved" and not role_has_permission(auth.role_code, "jewelry.buyback_approve"):
        raise HTTPException(status_code=403, detail="jewelry.buyback_approve required")
    if new_status == "assessed":
        row.assessed_by = auth.user_id
        if body.get("assessed_weight") is not None:
            row.assessed_weight = float(body["assessed_weight"])
        if body.get("assessed_purity"):
            row.assessed_purity = body["assessed_purity"]
        if body.get("final_buyback_value") is not None:
            row.final_buyback_value = float(body["final_buyback_value"])
    if new_status == "approved":
        row.approved_by = auth.user_id
    if new_status == "settled":
        row.settlement_method = body.get("settlement_method") or row.settlement_method or "cash"
        # Stock intake only after settled — individually tagged buyback becomes available stock qty +1
        if row.original_certificate_id:
            cert = session.get(JewelryCertificate, row.original_certificate_id)
            if cert and cert.company_id == auth.company_id:
                cert.status = "returned"
                session.add(cert)
        from app.inventory.constants import PURCHASE_RECEIVE
        from app.services.inventory_service import record_stock_movement

        # Buyback creates metal stock only when product_id known via certificate
        if row.original_certificate_id:
            cert = session.get(JewelryCertificate, row.original_certificate_id)
            if cert and cert.product_id:
                record_stock_movement(
                    session,
                    company_id=auth.company_id,
                    product_id=cert.product_id,
                    store_id=row.store_id or auth.store_id,
                    warehouse_id=None,
                    in_qty=1,
                    transaction_type=PURCHASE_RECEIVE,
                    transaction_ref=row.buyback_no,
                    reference_id=row.id,
                    note=f"Buyback settled {row.buyback_no}",
                    created_by=auth.user_id,
                )
    row.status = new_status
    if body.get("notes") is not None:
        row.notes = body.get("notes")
    session.add(row)
    write_audit(
        session,
        auth,
        "jewelry_buyback_status",
        "jewelry_buyback",
        row.id,
        {"from": current, "to": new_status},
    )
    session.flush()
    return _buyback_out(row)


# ── Jewelry Dashboard Statistics ─────────────────────────────────────────────

def get_jewelry_dashboard_stats(
    session: Session,
    company_id: str,
    store_id: str | None = None,
) -> dict[str, Any]:
    """Return dashboard KPI stats for the Jewelry vertical."""
    # Profiles count
    all_profiles = list_profiles(session, company_id)

    # Current effective gold rate
    gold_22k = get_effective_rate(session, company_id, metal_type="Gold", karat="22K")
    gold_21k = get_effective_rate(session, company_id, metal_type="Gold", karat="21K")
    gold_18k = get_effective_rate(session, company_id, metal_type="Gold", karat="18K")
    gold_24k = get_effective_rate(session, company_id, metal_type="Gold", karat="24K")
    silver_925 = get_effective_rate(session, company_id, metal_type="Silver", karat="925")

    # Certificates count
    cert_stmt = select(JewelryCertificate).where(JewelryCertificate.company_id == company_id)
    all_certs = session.exec(cert_stmt).all()
    active_certs = len([c for c in all_certs if c.status == "active"])

    # Buybacks
    buyback_stmt = select(JewelryBuyback).where(JewelryBuyback.company_id == company_id)
    all_buybacks = session.exec(buyback_stmt).all()
    pending_buybacks = len([b for b in all_buybacks if b.status in {"draft", "assessed", "approved"}])
    total_buyback_amount = sum(b.final_buyback_value for b in all_buybacks if b.status == "settled")

    # Active custom orders count
    custom_order_stmt = select(JewelryCustomOrder).where(JewelryCustomOrder.company_id == company_id)
    all_custom_orders = session.exec(custom_order_stmt).all()
    active_custom_orders = len([o for o in all_custom_orders if o.status not in {"delivered", "cancelled"}])

    # Work orders WIP count
    wo_stmt = select(JewelryWorkOrder).where(JewelryWorkOrder.company_id == company_id)
    all_work_orders = session.exec(wo_stmt).all()
    active_work_orders = len([w for w in all_work_orders if w.status not in {"completed", "closed", "cancelled"}])

    # Karigars total fine gold liability
    karigar_stmt = select(JewelryKarigar).where(JewelryKarigar.company_id == company_id)
    all_karigars = session.exec(karigar_stmt).all()
    total_karigar_gold = sum(k.fine_gold_balance for k in all_karigars)

    return {
        "board_rates": {
            "24K": gold_24k.get("selling_rate", 0),
            "22K": gold_22k.get("selling_rate", 0),
            "21K": gold_21k.get("selling_rate", 0),
            "18K": gold_18k.get("selling_rate", 0),
            "Silver_925": silver_925.get("selling_rate", 0),
        },
        "total_tagged_profiles": len(all_profiles),
        "active_certificates": active_certs,
        "pending_buybacks": pending_buybacks,
        "settled_buyback_amount": total_buyback_amount,
        "active_custom_orders": active_custom_orders,
        "active_work_orders": active_work_orders,
        "total_karigar_gold_grams": round(total_karigar_gold, 4),
        "total_karigar_gold_bhori": grams_to_bhori(total_karigar_gold),
    }


# ── Karigar (Artisan) Services ────────────────────────────────────────────────

def _karigar_out(k: JewelryKarigar) -> dict[str, Any]:
    return {
        "id": k.id,
        "code": k.code,
        "name": k.name,
        "phone": k.phone,
        "artisan_type": k.artisan_type,
        "specialty": k.specialty,
        "default_making_rate": k.default_making_rate,
        "default_rate_type": k.default_rate_type,
        "fine_gold_balance": round(k.fine_gold_balance, 4),
        "fine_gold_bhori": grams_to_bhori(k.fine_gold_balance),
        "status": k.status,
        "nid_no": k.nid_no,
        "address": k.address,
        "notes": k.notes,
        "created_at": k.created_at.isoformat() if k.created_at else None,
    }


def list_karigars(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(JewelryKarigar).where(JewelryKarigar.company_id == company_id)
    if status:
        stmt = stmt.where(JewelryKarigar.status == status)
    rows = session.exec(stmt.order_by(JewelryKarigar.name.asc())).all()  # type: ignore[attr-defined]
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for k in rows:
        row = _karigar_out(k)
        if q_lower:
            hay = f"{k.code} {k.name} {k.phone or ''} {k.specialty or ''}".lower()
            if q_lower not in hay:
                continue
        out.append(row)
    return out


def create_karigar(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Karigar name is required")
    code = str(body.get("code") or "").strip()
    if not code:
        code = _next_no(session, auth.company_id, "KRG", JewelryKarigar, "code")
    existing = session.exec(
        select(JewelryKarigar).where(
            JewelryKarigar.company_id == auth.company_id,
            JewelryKarigar.code == code,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Duplicate Karigar code: {code}")
    k = JewelryKarigar(
        company_id=auth.company_id,
        code=code,
        name=name,
        phone=body.get("phone"),
        artisan_type=str(body.get("artisan_type") or "external"),
        specialty=body.get("specialty"),
        default_making_rate=float(body.get("default_making_rate") or 0),
        default_rate_type=str(body.get("default_rate_type") or "per_gram"),
        fine_gold_balance=float(body.get("fine_gold_balance") or 0),
        status="active",
        nid_no=body.get("nid_no"),
        address=body.get("address"),
        notes=body.get("notes"),
    )
    session.add(k)
    session.flush()
    write_audit(session, auth, "jewelry_karigar_create", "jewelry_karigar", k.id)
    session.flush()
    return _karigar_out(k)


def get_karigar(session: Session, company_id: str, karigar_id: str) -> dict[str, Any]:
    k = session.get(JewelryKarigar, karigar_id)
    if not k or k.company_id != company_id:
        raise HTTPException(status_code=404, detail="Karigar not found")
    return _karigar_out(k)


def update_karigar(session: Session, auth: AuthContext, karigar_id: str, body: dict[str, Any]) -> dict[str, Any]:
    k = session.get(JewelryKarigar, karigar_id)
    if not k or k.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Karigar not found")
    if body.get("name"):
        k.name = str(body["name"]).strip()
    if "phone" in body:
        k.phone = body["phone"]
    if "artisan_type" in body:
        k.artisan_type = str(body["artisan_type"])
    if "specialty" in body:
        k.specialty = body["specialty"]
    if "default_making_rate" in body:
        k.default_making_rate = float(body["default_making_rate"])
    if "default_rate_type" in body:
        k.default_rate_type = str(body["default_rate_type"])
    if "status" in body:
        k.status = str(body["status"])
    if "nid_no" in body:
        k.nid_no = body["nid_no"]
    if "address" in body:
        k.address = body["address"]
    if "notes" in body:
        k.notes = body["notes"]
    session.add(k)
    session.flush()
    write_audit(session, auth, "jewelry_karigar_update", "jewelry_karigar", k.id)
    session.flush()
    return _karigar_out(k)


def get_karigar_ledger(session: Session, company_id: str, karigar_id: str) -> dict[str, Any]:
    k = session.get(JewelryKarigar, karigar_id)
    if not k or k.company_id != company_id:
        raise HTTPException(status_code=404, detail="Karigar not found")
    # Material Issues
    issues = session.exec(
        select(JewelryMaterialIssue)
        .where(JewelryMaterialIssue.company_id == company_id, JewelryMaterialIssue.karigar_id == karigar_id)
        .order_by(JewelryMaterialIssue.issue_date.desc())
    ).all()
    # Material Returns
    returns = session.exec(
        select(JewelryMaterialReturn)
        .where(JewelryMaterialReturn.company_id == company_id, JewelryMaterialReturn.karigar_id == karigar_id)
        .order_by(JewelryMaterialReturn.return_date.desc())
    ).all()
    # Recoveries
    recoveries = session.exec(
        select(JewelryProductionRecovery)
        .where(JewelryProductionRecovery.company_id == company_id, JewelryProductionRecovery.karigar_id == karigar_id)
        .order_by(JewelryProductionRecovery.recovery_date.desc())
    ).all()
    # Work orders completed
    work_orders = session.exec(
        select(JewelryWorkOrder)
        .where(JewelryWorkOrder.company_id == company_id, JewelryWorkOrder.karigar_id == karigar_id)
        .order_by(JewelryWorkOrder.created_at.desc())
    ).all()
    # Wage bills
    bills = session.exec(
        select(JewelryKarigarBill)
        .where(JewelryKarigarBill.company_id == company_id, JewelryKarigarBill.karigar_id == karigar_id)
        .order_by(JewelryKarigarBill.bill_date.desc())
    ).all()

    total_issued_fine = sum(i.fine_gold_weight for i in issues)
    total_returned_fine = sum(r.fine_gold_weight for r in returns)
    total_recovered_fine = sum(rec.fine_gold_weight for rec in recoveries)
    total_finished_fine = sum(w.finished_fine_weight for w in work_orders if w.status in {"completed", "closed"})

    return {
        "karigar": _karigar_out(k),
        "summary": {
            "total_issued_fine_grams": round(total_issued_fine, 4),
            "total_returned_fine_grams": round(total_returned_fine, 4),
            "total_recovered_fine_grams": round(total_recovered_fine, 4),
            "total_finished_fine_grams": round(total_finished_fine, 4),
            "current_balance_fine_grams": round(k.fine_gold_balance, 4),
            "current_balance_bhori": grams_to_bhori(k.fine_gold_balance),
        },
        "issues": [
            {
                "id": i.id,
                "issue_no": i.issue_no,
                "work_order_id": i.work_order_id,
                "item_type": i.item_type,
                "gross_weight": i.gross_weight,
                "fine_gold_weight": i.fine_gold_weight,
                "issue_date": i.issue_date.isoformat() if i.issue_date else None,
            }
            for i in issues
        ],
        "returns": [
            {
                "id": r.id,
                "return_no": r.return_no,
                "work_order_id": r.work_order_id,
                "return_type": r.return_type,
                "gross_weight": r.gross_weight,
                "fine_gold_weight": r.fine_gold_weight,
                "return_date": r.return_date.isoformat() if r.return_date else None,
            }
            for r in returns
        ],
        "recoveries": [
            {
                "id": rec.id,
                "recovery_no": rec.recovery_no,
                "work_order_id": rec.work_order_id,
                "recovery_type": rec.recovery_type,
                "gross_weight": rec.gross_weight,
                "fine_gold_weight": rec.fine_gold_weight,
                "recovery_date": rec.recovery_date.isoformat() if rec.recovery_date else None,
            }
            for rec in recoveries
        ],
        "bills": [
            {
                "id": b.id,
                "bill_no": b.bill_no,
                "work_order_id": b.work_order_id,
                "net_payable": b.net_payable,
                "payment_status": b.payment_status,
                "bill_date": b.bill_date.isoformat() if b.bill_date else None,
            }
            for b in bills
        ],
    }


# ── Production Work Orders & Reconciliation Services ──────────────────────────

def _work_order_out(wo: JewelryWorkOrder, karigar: JewelryKarigar | None = None) -> dict[str, Any]:
    return {
        "id": wo.id,
        "work_order_no": wo.work_order_no,
        "order_type": wo.order_type,
        "custom_order_id": wo.custom_order_id,
        "product_id": wo.product_id,
        "design_name": wo.design_name,
        "item_category": wo.item_category,
        "metal_type": wo.metal_type,
        "karat": wo.karat,
        "purity": wo.purity,
        "target_gross_weight": wo.target_gross_weight,
        "target_net_weight": wo.target_net_weight,
        "target_weight_bhori": grams_to_bhori(wo.target_gross_weight),
        "allowed_loss_percentage": wo.allowed_loss_percentage,
        "karigar_id": wo.karigar_id,
        "karigar_name": karigar.name if karigar else None,
        "status": wo.status,
        "stage": wo.stage,
        "due_date": wo.due_date.isoformat() if wo.due_date else None,
        "issued_fine_weight": round(wo.issued_fine_weight, 4),
        "returned_fine_weight": round(wo.returned_fine_weight, 4),
        "recovered_fine_weight": round(wo.recovered_fine_weight, 4),
        "finished_gross_weight": round(wo.finished_gross_weight, 4),
        "finished_net_weight": round(wo.finished_net_weight, 4),
        "finished_fine_weight": round(wo.finished_fine_weight, 4),
        "actual_loss_weight": round(wo.actual_loss_weight, 4),
        "variance_weight": round(wo.variance_weight, 4),
        "is_reconciled": wo.is_reconciled,
        "reconciled_at": wo.reconciled_at.isoformat() if wo.reconciled_at else None,
        "reconciled_by": wo.reconciled_by,
        "making_charge_amount": wo.making_charge_amount,
        "tag_no": wo.tag_no,
        "created_by": wo.created_by,
        "approved_by": wo.approved_by,
        "notes": wo.notes,
        "created_at": wo.created_at.isoformat() if wo.created_at else None,
    }


def list_work_orders(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    karigar_id: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(JewelryWorkOrder).where(JewelryWorkOrder.company_id == company_id)
    if status:
        stmt = stmt.where(JewelryWorkOrder.status == status)
    if stage:
        stmt = stmt.where(JewelryWorkOrder.stage == stage)
    if karigar_id:
        stmt = stmt.where(JewelryWorkOrder.karigar_id == karigar_id)
    rows = session.exec(stmt.order_by(JewelryWorkOrder.created_at.desc())).all()  # type: ignore[attr-defined]
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for wo in rows:
        karigar = session.get(JewelryKarigar, wo.karigar_id) if wo.karigar_id else None
        row = _work_order_out(wo, karigar)
        if q_lower:
            hay = f"{wo.work_order_no} {wo.design_name} {wo.tag_no or ''} {karigar.name if karigar else ''}".lower()
            if q_lower not in hay:
                continue
        out.append(row)
    return out


def create_work_order(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    design_name = str(body.get("design_name") or "Custom Jewelry Piece").strip()
    karat = normalize_karat(str(body.get("karat") or body.get("purity") or "22K"))
    metal_type = str(body.get("metal_type") or "Gold")
    target_gross = float(body.get("target_gross_weight") or body.get("target_weight") or 0)
    target_net = float(body.get("target_net_weight") or target_gross)
    karigar_id = body.get("karigar_id")
    if karigar_id:
        karigar = session.get(JewelryKarigar, karigar_id)
        if not karigar or karigar.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Karigar not found")

    due_date = None
    if body.get("due_date"):
        try:
            due_date = datetime.fromisoformat(str(body["due_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass

    wo = JewelryWorkOrder(
        company_id=auth.company_id,
        work_order_no=_next_no(session, auth.company_id, "WO", JewelryWorkOrder, "work_order_no"),
        order_type=str(body.get("order_type") or "custom_order"),
        custom_order_id=body.get("custom_order_id"),
        product_id=body.get("product_id"),
        design_name=design_name,
        item_category=body.get("item_category"),
        metal_type=metal_type,
        karat=karat,
        purity=karat,
        target_gross_weight=target_gross,
        target_net_weight=target_net,
        allowed_loss_percentage=float(body.get("allowed_loss_percentage") if body.get("allowed_loss_percentage") is not None else 2.0),
        karigar_id=karigar_id,
        status="draft",
        stage=str(body.get("stage") or "melting"),
        due_date=due_date,
        making_charge_amount=float(body.get("making_charge_amount") or 0),
        created_by=auth.user_id,
        notes=body.get("notes"),
    )
    session.add(wo)
    session.flush()

    # Initial operation entry
    op = JewelryWorkOperation(
        company_id=auth.company_id,
        work_order_id=wo.id,
        stage=wo.stage,
        status="pending",
        notes="Work order created",
    )
    session.add(op)
    session.flush()

    write_audit(session, auth, "jewelry_work_order_create", "jewelry_work_order", wo.id)
    session.flush()
    karigar = session.get(JewelryKarigar, wo.karigar_id) if wo.karigar_id else None
    return _work_order_out(wo, karigar)


def get_work_order(session: Session, company_id: str, work_order_id: str) -> dict[str, Any]:
    wo = session.get(JewelryWorkOrder, work_order_id)
    if not wo or wo.company_id != company_id:
        raise HTTPException(status_code=404, detail="Work order not found")
    karigar = session.get(JewelryKarigar, wo.karigar_id) if wo.karigar_id else None

    # Load issues, returns, recoveries, operations
    issues = session.exec(
        select(JewelryMaterialIssue).where(
            JewelryMaterialIssue.company_id == company_id,
            JewelryMaterialIssue.work_order_id == work_order_id,
        )
    ).all()
    returns = session.exec(
        select(JewelryMaterialReturn).where(
            JewelryMaterialReturn.company_id == company_id,
            JewelryMaterialReturn.work_order_id == work_order_id,
        )
    ).all()
    recoveries = session.exec(
        select(JewelryProductionRecovery).where(
            JewelryProductionRecovery.company_id == company_id,
            JewelryProductionRecovery.work_order_id == work_order_id,
        )
    ).all()
    operations = session.exec(
        select(JewelryWorkOperation).where(
            JewelryWorkOperation.company_id == company_id,
            JewelryWorkOperation.work_order_id == work_order_id,
        ).order_by(JewelryWorkOperation.performed_at.asc())
    ).all()

    data = _work_order_out(wo, karigar)
    data["issues"] = [
        {
            "id": i.id,
            "issue_no": i.issue_no,
            "item_type": i.item_type,
            "karat": i.karat,
            "gross_weight": i.gross_weight,
            "fine_gold_weight": i.fine_gold_weight,
            "issue_date": i.issue_date.isoformat() if i.issue_date else None,
            "issued_by": i.issued_by,
        }
        for i in issues
    ]
    data["returns"] = [
        {
            "id": r.id,
            "return_no": r.return_no,
            "return_type": r.return_type,
            "karat": r.karat,
            "gross_weight": r.gross_weight,
            "fine_gold_weight": r.fine_gold_weight,
            "return_date": r.return_date.isoformat() if r.return_date else None,
        }
        for r in returns
    ]
    data["recoveries"] = [
        {
            "id": rec.id,
            "recovery_no": rec.recovery_no,
            "recovery_type": rec.recovery_type,
            "gross_weight": rec.gross_weight,
            "tested_purity": rec.tested_purity,
            "fine_gold_weight": rec.fine_gold_weight,
            "recovery_date": rec.recovery_date.isoformat() if rec.recovery_date else None,
        }
        for rec in recoveries
    ]
    data["operations"] = [
        {
            "id": op.id,
            "stage": op.stage,
            "status": op.status,
            "operator_name": op.operator_name,
            "notes": op.notes,
            "performed_at": op.performed_at.isoformat() if op.performed_at else None,
        }
        for op in operations
    ]
    return data


def update_work_order_stage(
    session: Session, auth: AuthContext, work_order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    wo = session.get(JewelryWorkOrder, work_order_id)
    if not wo or wo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Work order not found")
    new_stage = str(body.get("stage") or "").strip()
    if not new_stage:
        raise HTTPException(status_code=400, detail="stage is required")
    wo.stage = new_stage
    if body.get("status"):
        wo.status = str(body["status"])
    if body.get("karigar_id"):
        wo.karigar_id = body["karigar_id"]

    op = JewelryWorkOperation(
        company_id=auth.company_id,
        work_order_id=wo.id,
        stage=new_stage,
        status="completed",
        operator_name=body.get("operator_name") or auth.user_id,
        notes=body.get("notes"),
    )
    session.add(op)
    session.add(wo)
    session.flush()
    write_audit(session, auth, "jewelry_work_order_stage", "jewelry_work_order", wo.id, {"stage": new_stage})
    session.flush()
    karigar = session.get(JewelryKarigar, wo.karigar_id) if wo.karigar_id else None
    return _work_order_out(wo, karigar)


def issue_material_to_work_order(
    session: Session, auth: AuthContext, work_order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    wo = session.get(JewelryWorkOrder, work_order_id)
    if not wo or wo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Work order not found")
    karigar_id = body.get("karigar_id") or wo.karigar_id
    if not karigar_id:
        raise HTTPException(status_code=400, detail="Karigar must be assigned before issuing material")
    karigar = session.get(JewelryKarigar, karigar_id)
    if not karigar or karigar.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Karigar not found")

    gross = float(body.get("gross_weight") or 0)
    if gross <= 0:
        raise HTTPException(status_code=400, detail="gross_weight must be greater than 0")
    karat = normalize_karat(str(body.get("karat") or body.get("purity") or wo.karat))
    purity_factor = float(body.get("purity_factor") or get_purity_factor(karat))
    fine_weight = round(gross * purity_factor, 4)

    issue = JewelryMaterialIssue(
        company_id=auth.company_id,
        issue_no=_next_no(session, auth.company_id, "ISS", JewelryMaterialIssue, "issue_no"),
        work_order_id=wo.id,
        karigar_id=karigar.id,
        item_type=str(body.get("item_type") or "raw_gold"),
        metal_type=str(body.get("metal_type") or wo.metal_type),
        karat=karat,
        gross_weight=gross,
        purity_factor=purity_factor,
        fine_gold_weight=fine_weight,
        stone_pieces=int(body.get("stone_pieces") or 0),
        stone_carat=float(body.get("stone_carat") or 0),
        stone_desc=body.get("stone_desc"),
        issued_by=auth.user_id,
        notes=body.get("notes"),
    )
    session.add(issue)

    # Increase work order issued fine weight and Karigar gold liability balance
    wo.issued_fine_weight = round(wo.issued_fine_weight + fine_weight, 4)
    wo.karigar_id = karigar.id
    if wo.status == "draft":
        wo.status = "in_progress"
    karigar.fine_gold_balance = round(karigar.fine_gold_balance + fine_weight, 4)

    session.add(wo)
    session.add(karigar)
    session.flush()

    write_audit(
        session,
        auth,
        "jewelry_material_issue",
        "jewelry_material_issue",
        issue.id,
        {"work_order_no": wo.work_order_no, "fine_gold_weight": fine_weight, "karigar": karigar.name},
    )
    session.flush()
    return get_work_order(session, auth.company_id, wo.id)


def return_material_from_work_order(
    session: Session, auth: AuthContext, work_order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    wo = session.get(JewelryWorkOrder, work_order_id)
    if not wo or wo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Work order not found")
    karigar_id = body.get("karigar_id") or wo.karigar_id
    if not karigar_id:
        raise HTTPException(status_code=400, detail="Karigar not found")
    karigar = session.get(JewelryKarigar, karigar_id)
    if not karigar or karigar.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Karigar not found")

    gross = float(body.get("gross_weight") or 0)
    if gross <= 0:
        raise HTTPException(status_code=400, detail="gross_weight must be greater than 0")
    karat = normalize_karat(str(body.get("karat") or body.get("purity") or wo.karat))
    purity_factor = float(body.get("purity_factor") or get_purity_factor(karat))
    fine_weight = round(gross * purity_factor, 4)

    ret = JewelryMaterialReturn(
        company_id=auth.company_id,
        return_no=_next_no(session, auth.company_id, "RET", JewelryMaterialReturn, "return_no"),
        work_order_id=wo.id,
        karigar_id=karigar.id,
        return_type=str(body.get("return_type") or "unused_metal"),
        metal_type=str(body.get("metal_type") or wo.metal_type),
        karat=karat,
        gross_weight=gross,
        purity_factor=purity_factor,
        fine_gold_weight=fine_weight,
        received_by=auth.user_id,
        notes=body.get("notes"),
    )
    session.add(ret)

    # Update work order returned fine weight and decrease Karigar fine gold liability
    wo.returned_fine_weight = round(wo.returned_fine_weight + fine_weight, 4)
    karigar.fine_gold_balance = round(max(0, karigar.fine_gold_balance - fine_weight), 4)

    session.add(wo)
    session.add(karigar)
    session.flush()

    write_audit(session, auth, "jewelry_material_return", "jewelry_material_return", ret.id)
    session.flush()
    return get_work_order(session, auth.company_id, wo.id)


def record_production_recovery(
    session: Session, auth: AuthContext, work_order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    wo = session.get(JewelryWorkOrder, work_order_id)
    if not wo or wo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Work order not found")
    karigar_id = body.get("karigar_id") or wo.karigar_id
    if not karigar_id:
        raise HTTPException(status_code=400, detail="Karigar not found")
    karigar = session.get(JewelryKarigar, karigar_id)
    if not karigar or karigar.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Karigar not found")

    gross = float(body.get("gross_weight") or 0)
    if gross <= 0:
        raise HTTPException(status_code=400, detail="gross_weight must be greater than 0")
    tested_purity = float(body.get("tested_purity") if body.get("tested_purity") is not None else 0.85)
    fine_weight = round(gross * tested_purity, 4)

    rec = JewelryProductionRecovery(
        company_id=auth.company_id,
        recovery_no=_next_no(session, auth.company_id, "REC", JewelryProductionRecovery, "recovery_no"),
        work_order_id=wo.id,
        karigar_id=karigar.id,
        recovery_type=str(body.get("recovery_type") or "polish_dust"),
        gross_weight=gross,
        tested_purity=tested_purity,
        fine_gold_weight=fine_weight,
        recorded_by=auth.user_id,
        notes=body.get("notes"),
    )
    session.add(rec)

    # Update work order recovery weight and credit Karigar fine gold liability
    wo.recovered_fine_weight = round(wo.recovered_fine_weight + fine_weight, 4)
    karigar.fine_gold_balance = round(max(0, karigar.fine_gold_balance - fine_weight), 4)

    session.add(wo)
    session.add(karigar)
    session.flush()

    write_audit(session, auth, "jewelry_production_recovery", "jewelry_production_recovery", rec.id)
    session.flush()
    return get_work_order(session, auth.company_id, wo.id)


def reconcile_work_order(
    session: Session, auth: AuthContext, work_order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Execute fine-gold balance reconciliation formula on a finished work order."""
    wo = session.get(JewelryWorkOrder, work_order_id)
    if not wo or wo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Work order not found")

    finished_gross = float(body.get("finished_gross_weight") or wo.finished_gross_weight or 0)
    finished_net = float(body.get("finished_net_weight") or finished_gross)
    if finished_net <= 0:
        raise HTTPException(status_code=400, detail="finished_net_weight must be greater than 0")

    purity_factor = get_purity_factor(wo.karat)
    finished_fine = round(finished_net * purity_factor, 4)

    wo.finished_gross_weight = finished_gross
    wo.finished_net_weight = finished_net
    wo.finished_fine_weight = finished_fine

    # Mandatory reconciliation formula:
    # Fine gold issued = Finished Output Fine + Returned Fine + Recovered Fine + Loss
    accounted_fine = round(finished_fine + wo.returned_fine_weight + wo.recovered_fine_weight, 4)
    actual_loss = round(wo.issued_fine_weight - accounted_fine, 4)
    allowed_loss = round(wo.issued_fine_weight * (wo.allowed_loss_percentage / 100.0), 4)
    variance = round(actual_loss - allowed_loss, 4)

    wo.actual_loss_weight = actual_loss
    wo.variance_weight = variance

    # Check tolerance
    if variance > 0.05 and not body.get("force_override"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Fine-gold loss ({actual_loss}g) exceeds allowed tolerance ({allowed_loss}g) "
                f"by {variance}g. Supervisor approval/override required."
            ),
        )

    # Deduct finished fine gold from Karigar's outstanding balance
    if wo.karigar_id:
        karigar = session.get(JewelryKarigar, wo.karigar_id)
        if karigar:
            karigar.fine_gold_balance = round(max(0, karigar.fine_gold_balance - finished_fine), 4)
            session.add(karigar)

    wo.is_reconciled = True
    wo.reconciled_at = _utc_now()
    wo.reconciled_by = auth.user_id
    wo.status = "qc"
    wo.stage = "qc"

    session.add(wo)
    session.flush()

    write_audit(
        session,
        auth,
        "jewelry_work_order_reconcile",
        "jewelry_work_order",
        wo.id,
        {
            "issued_fine": wo.issued_fine_weight,
            "finished_fine": finished_fine,
            "actual_loss": actual_loss,
            "variance": variance,
        },
    )
    session.flush()
    karigar = session.get(JewelryKarigar, wo.karigar_id) if wo.karigar_id else None
    return _work_order_out(wo, karigar)


def complete_and_tag_work_order(
    session: Session, auth: AuthContext, work_order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Complete work order, generate unique jewelry tag, certificate, and finished stock entry."""
    wo = session.get(JewelryWorkOrder, work_order_id)
    if not wo or wo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Work order not found")
    if not wo.is_reconciled:
        raise HTTPException(status_code=400, detail="Work order must be fine-gold reconciled before completion")

    tag_no = str(body.get("tag_no") or wo.tag_no or "").strip()
    if not tag_no:
        tag_no = _next_no(session, auth.company_id, "TAG", JewelryCertificate, "cert_no")

    wo.tag_no = tag_no
    wo.status = "completed"
    wo.stage = "completed"
    wo.approved_by = auth.user_id

    # If linked to a custom order, advance custom order status to 'ready'
    if wo.custom_order_id:
        co = session.get(JewelryCustomOrder, wo.custom_order_id)
        if co and co.company_id == auth.company_id:
            co.status = "ready"
            co.tag_no = tag_no
            co.final_gross_weight = wo.finished_gross_weight
            co.final_net_weight = wo.finished_net_weight
            session.add(co)

    # Create certificate / tag registry entry if not already present
    cert = session.exec(
        select(JewelryCertificate).where(
            JewelryCertificate.company_id == auth.company_id,
            JewelryCertificate.cert_no == tag_no,
        )
    ).first()
    if not cert:
        cert = JewelryCertificate(
            company_id=auth.company_id,
            product_id=wo.product_id or "",
            cert_no=tag_no,
            certificate_no=tag_no,
            tag_no=tag_no,
            metal_type=wo.metal_type,
            purity=wo.karat,
            weight_gram=wo.finished_net_weight,
            gross_weight=wo.finished_gross_weight,
            stone_weight=max(0, wo.finished_gross_weight - wo.finished_net_weight),
            net_metal_weight=wo.finished_net_weight,
            issue_date=_utc_now(),
            status="active",
            created_by=auth.user_id,
        )
        session.add(cert)

    session.add(wo)
    session.flush()

    write_audit(session, auth, "jewelry_work_order_complete", "jewelry_work_order", wo.id, {"tag_no": tag_no})
    session.flush()
    karigar = session.get(JewelryKarigar, wo.karigar_id) if wo.karigar_id else None
    return _work_order_out(wo, karigar)


# ── Karigar Billing Services ──────────────────────────────────────────────────

def _karigar_bill_out(b: JewelryKarigarBill, karigar: JewelryKarigar | None = None) -> dict[str, Any]:
    return {
        "id": b.id,
        "bill_no": b.bill_no,
        "karigar_id": b.karigar_id,
        "karigar_name": karigar.name if karigar else None,
        "work_order_id": b.work_order_id,
        "total_weight_gram": b.total_weight_gram,
        "rate_per_gram": b.rate_per_gram,
        "piece_count": b.piece_count,
        "making_charge_gross": b.making_charge_gross,
        "deductions": b.deductions,
        "net_payable": b.net_payable,
        "payment_status": b.payment_status,
        "paid_amount": b.paid_amount,
        "payment_ref": b.payment_ref,
        "bill_date": b.bill_date.isoformat() if b.bill_date else None,
        "approved_by": b.approved_by,
        "notes": b.notes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def list_karigar_bills(
    session: Session,
    company_id: str,
    *,
    karigar_id: str | None = None,
    payment_status: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(JewelryKarigarBill).where(JewelryKarigarBill.company_id == company_id)
    if karigar_id:
        stmt = stmt.where(JewelryKarigarBill.karigar_id == karigar_id)
    if payment_status:
        stmt = stmt.where(JewelryKarigarBill.payment_status == payment_status)
    rows = session.exec(stmt.order_by(JewelryKarigarBill.bill_date.desc())).all()  # type: ignore[attr-defined]
    out: list[dict[str, Any]] = []
    for b in rows:
        karigar = session.get(JewelryKarigar, b.karigar_id)
        out.append(_karigar_bill_out(b, karigar))
    return out


def create_karigar_bill(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    karigar_id = body.get("karigar_id")
    if not karigar_id:
        raise HTTPException(status_code=400, detail="karigar_id is required")
    karigar = session.get(JewelryKarigar, karigar_id)
    if not karigar or karigar.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Karigar not found")

    weight = float(body.get("total_weight_gram") or 0)
    rate = float(body.get("rate_per_gram") or karigar.default_making_rate or 0)
    pieces = int(body.get("piece_count") or 1)
    rate_type = str(body.get("rate_type") or karigar.default_rate_type or "per_gram")

    if rate_type == "per_piece":
        gross = round(rate * pieces, 2)
    else:
        gross = round(rate * weight, 2)

    deductions = float(body.get("deductions") or 0)
    net = round(max(0, gross - deductions), 2)

    bill = JewelryKarigarBill(
        company_id=auth.company_id,
        bill_no=_next_no(session, auth.company_id, "KB", JewelryKarigarBill, "bill_no"),
        karigar_id=karigar.id,
        work_order_id=body.get("work_order_id"),
        total_weight_gram=weight,
        rate_per_gram=rate,
        piece_count=pieces,
        making_charge_gross=gross,
        deductions=deductions,
        net_payable=net,
        payment_status="unpaid",
        paid_amount=0.0,
        approved_by=auth.user_id,
        notes=body.get("notes"),
    )
    session.add(bill)
    session.flush()
    write_audit(session, auth, "jewelry_karigar_bill_create", "jewelry_karigar_bill", bill.id, {"net_payable": net})
    session.flush()
    return _karigar_bill_out(bill, karigar)


def pay_karigar_bill(session: Session, auth: AuthContext, bill_id: str, body: dict[str, Any]) -> dict[str, Any]:
    bill = session.get(JewelryKarigarBill, bill_id)
    if not bill or bill.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Karigar bill not found")
    amount = float(body.get("amount") or bill.net_payable - bill.paid_amount)
    bill.paid_amount = round(bill.paid_amount + amount, 2)
    if bill.paid_amount >= bill.net_payable:
        bill.payment_status = "paid"
    else:
        bill.payment_status = "partially_paid"
    bill.payment_ref = body.get("payment_ref") or body.get("transaction_ref")
    session.add(bill)
    session.flush()
    write_audit(session, auth, "jewelry_karigar_bill_pay", "jewelry_karigar_bill", bill.id, {"paid": amount})
    session.flush()
    karigar = session.get(JewelryKarigar, bill.karigar_id)
    return _karigar_bill_out(bill, karigar)


# ── Custom Customer Orders & Advances Services ────────────────────────────────

def _custom_order_out(co: JewelryCustomOrder) -> dict[str, Any]:
    return {
        "id": co.id,
        "order_no": co.order_no,
        "customer_id": co.customer_id,
        "customer_name": co.customer_name,
        "customer_phone": co.customer_phone,
        "design_name": co.design_name,
        "design_image_url": co.design_image_url,
        "item_category": co.item_category,
        "metal_type": co.metal_type,
        "karat": co.karat,
        "purity": co.purity,
        "target_gross_weight": co.target_gross_weight,
        "target_net_weight": co.target_net_weight,
        "target_weight_bhori": grams_to_bhori(co.target_gross_weight),
        "weight_tolerance_gram": co.weight_tolerance_gram,
        "estimated_rate_per_gram": co.estimated_rate_per_gram,
        "rate_lock_policy": co.rate_lock_policy,
        "making_charge_type": co.making_charge_type,
        "making_charge_rate": co.making_charge_rate,
        "wastage_percentage": co.wastage_percentage,
        "estimated_stone_value": co.estimated_stone_value,
        "estimated_total": co.estimated_total,
        "advance_paid": co.advance_paid,
        "balance_due": round(max(0, (co.final_total_amount or co.estimated_total) - co.advance_paid), 2),
        "delivery_date": co.delivery_date.isoformat() if co.delivery_date else None,
        "status": co.status,
        "final_gross_weight": co.final_gross_weight,
        "final_net_weight": co.final_net_weight,
        "final_metal_rate": co.final_metal_rate,
        "final_making_charge": co.final_making_charge,
        "final_wastage_value": co.final_wastage_value,
        "final_stone_value": co.final_stone_value,
        "final_tax_amount": co.final_tax_amount,
        "final_total_amount": co.final_total_amount,
        "final_balance_paid": co.final_balance_paid,
        "sales_invoice_id": co.sales_invoice_id,
        "work_order_id": co.work_order_id,
        "tag_no": co.tag_no,
        "created_by": co.created_by,
        "notes": co.notes,
        "created_at": co.created_at.isoformat() if co.created_at else None,
    }


def list_custom_orders(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(JewelryCustomOrder).where(JewelryCustomOrder.company_id == company_id)
    if status:
        stmt = stmt.where(JewelryCustomOrder.status == status)
    rows = session.exec(stmt.order_by(JewelryCustomOrder.created_at.desc())).all()  # type: ignore[attr-defined]
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for co in rows:
        row = _custom_order_out(co)
        if q_lower:
            hay = f"{co.order_no} {co.customer_name} {co.customer_phone or ''} {co.design_name}".lower()
            if q_lower not in hay:
                continue
        out.append(row)
    return out


def create_custom_order(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    customer_name = str(body.get("customer_name") or "").strip()
    if not customer_name:
        raise HTTPException(status_code=400, detail="customer_name is required")
    design_name = str(body.get("design_name") or "").strip()
    if not design_name:
        raise HTTPException(status_code=400, detail="design_name is required")

    karat = normalize_karat(str(body.get("karat") or body.get("purity") or "22K"))
    metal_type = str(body.get("metal_type") or "Gold")
    target_gross = float(body.get("target_gross_weight") or body.get("target_weight") or 0)
    target_net = float(body.get("target_net_weight") or target_gross)

    rate_info = get_effective_rate(session, auth.company_id, metal_type=metal_type, karat=karat)
    rate_per_gram = float(body.get("estimated_rate_per_gram") or rate_info.get("selling_rate") or 0)

    making_type = str(body.get("making_charge_type") or "per_gram")
    making_rate = float(body.get("making_charge_rate") or 0)
    wastage = float(body.get("wastage_percentage") or 0)
    stone_val = float(body.get("estimated_stone_value") or 0)

    # Estimate total
    est_calc = calculate_jewelry_price(
        net_metal_weight=target_net,
        metal_rate=rate_per_gram,
        making_charge_type=making_type,
        making_charge_rate=making_rate,
        wastage_percentage=wastage,
        stone_value=stone_val,
        tax_rate=0.05,
    )
    est_total = float(body.get("estimated_total") or est_calc["net_amount"])

    delivery_date = None
    if body.get("delivery_date"):
        try:
            delivery_date = datetime.fromisoformat(str(body["delivery_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass

    co = JewelryCustomOrder(
        company_id=auth.company_id,
        order_no=_next_no(session, auth.company_id, "JORD", JewelryCustomOrder, "order_no"),
        customer_id=body.get("customer_id"),
        customer_name=customer_name,
        customer_phone=body.get("customer_phone"),
        design_name=design_name,
        design_image_url=body.get("design_image_url"),
        item_category=body.get("item_category"),
        metal_type=metal_type,
        karat=karat,
        purity=karat,
        target_gross_weight=target_gross,
        target_net_weight=target_net,
        weight_tolerance_gram=float(body.get("weight_tolerance_gram") or 0.5),
        estimated_rate_per_gram=rate_per_gram,
        rate_lock_policy=str(body.get("rate_lock_policy") or "locked"),
        making_charge_type=making_type,
        making_charge_rate=making_rate,
        wastage_percentage=wastage,
        estimated_stone_value=stone_val,
        estimated_total=est_total,
        advance_paid=0.0,
        delivery_date=delivery_date,
        status="quoted",
        created_by=auth.user_id,
        notes=body.get("notes"),
    )
    session.add(co)
    session.flush()

    # Record advance if provided at creation
    initial_advance = float(body.get("initial_advance") or 0)
    if initial_advance > 0:
        adv = JewelryOrderAdvance(
            company_id=auth.company_id,
            advance_no=_next_no(session, auth.company_id, "ADV", JewelryOrderAdvance, "advance_no"),
            custom_order_id=co.id,
            customer_id=co.customer_id,
            amount=initial_advance,
            payment_mode=str(body.get("advance_payment_mode") or "cash"),
            transaction_ref=body.get("advance_transaction_ref"),
            received_by=auth.user_id,
        )
        session.add(adv)
        co.advance_paid = initial_advance
        co.status = "confirmed"
        session.add(co)
        session.flush()

    write_audit(session, auth, "jewelry_custom_order_create", "jewelry_custom_order", co.id)
    session.flush()
    return _custom_order_out(co)


def get_custom_order(session: Session, company_id: str, order_id: str) -> dict[str, Any]:
    co = session.get(JewelryCustomOrder, order_id)
    if not co or co.company_id != company_id:
        raise HTTPException(status_code=404, detail="Custom order not found")
    advances = session.exec(
        select(JewelryOrderAdvance)
        .where(JewelryOrderAdvance.company_id == company_id, JewelryOrderAdvance.custom_order_id == order_id)
        .order_by(JewelryOrderAdvance.advance_date.desc())
    ).all()
    data = _custom_order_out(co)
    data["advances"] = [
        {
            "id": a.id,
            "advance_no": a.advance_no,
            "amount": a.amount,
            "payment_mode": a.payment_mode,
            "transaction_ref": a.transaction_ref,
            "advance_date": a.advance_date.isoformat() if a.advance_date else None,
            "received_by": a.received_by,
        }
        for a in advances
    ]
    return data


def record_order_advance(
    session: Session, auth: AuthContext, order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    co = session.get(JewelryCustomOrder, order_id)
    if not co or co.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Custom order not found")
    amount = float(body.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Advance amount must be greater than 0")

    adv = JewelryOrderAdvance(
        company_id=auth.company_id,
        advance_no=_next_no(session, auth.company_id, "ADV", JewelryOrderAdvance, "advance_no"),
        custom_order_id=co.id,
        customer_id=co.customer_id,
        amount=amount,
        payment_mode=str(body.get("payment_mode") or "cash"),
        transaction_ref=body.get("transaction_ref"),
        received_by=auth.user_id,
        notes=body.get("notes"),
    )
    session.add(adv)
    co.advance_paid = round(co.advance_paid + amount, 2)
    if co.status == "quoted":
        co.status = "confirmed"
    session.add(co)
    session.flush()

    write_audit(session, auth, "jewelry_order_advance", "jewelry_order_advance", adv.id, {"amount": amount})
    session.flush()
    return get_custom_order(session, auth.company_id, co.id)


def deliver_custom_order(
    session: Session, auth: AuthContext, order_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Calculate final bill from actual finished weight per rate policy and deliver order."""
    co = session.get(JewelryCustomOrder, order_id)
    if not co or co.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Custom order not found")

    final_gross = float(body.get("final_gross_weight") or co.final_gross_weight or co.target_gross_weight)
    final_net = float(body.get("final_net_weight") or co.final_net_weight or final_gross)

    # Determine applicable rate per policy
    if co.rate_lock_policy == "locked":
        applied_rate = co.estimated_rate_per_gram
    else:
        rate_info = get_effective_rate(session, auth.company_id, metal_type=co.metal_type, karat=co.karat)
        applied_rate = float(rate_info.get("selling_rate") or co.estimated_rate_per_gram)

    calc = calculate_jewelry_price(
        net_metal_weight=final_net,
        metal_rate=applied_rate,
        making_charge_type=co.making_charge_type,
        making_charge_rate=co.making_charge_rate,
        wastage_percentage=co.wastage_percentage,
        stone_value=float(body.get("final_stone_value") or co.estimated_stone_value),
        tax_rate=0.05,
    )

    final_total = calc["net_amount"]
    balance_to_pay = round(max(0, final_total - co.advance_paid), 2)
    balance_paid = float(body.get("balance_paid") if body.get("balance_paid") is not None else balance_to_pay)

    co.final_gross_weight = final_gross
    co.final_net_weight = final_net
    co.final_metal_rate = applied_rate
    co.final_making_charge = calc["making_charge"]
    co.final_wastage_value = calc["wastage_value"]
    co.final_stone_value = calc["stone_value"]
    co.final_tax_amount = calc["tax_amount"]
    co.final_total_amount = final_total
    co.final_balance_paid = balance_paid
    co.status = "delivered"

    session.add(co)
    session.flush()

    write_audit(
        session,
        auth,
        "jewelry_custom_order_deliver",
        "jewelry_custom_order",
        co.id,
        {"final_total": final_total, "balance_paid": balance_paid},
    )
    session.flush()
    return get_custom_order(session, auth.company_id, co.id)


# ── Old-Gold Melting Lots & Recovery Services ─────────────────────────────────

def _melting_lot_out(m: JewelryMeltingLot) -> dict[str, Any]:
    return {
        "id": m.id,
        "lot_no": m.lot_no,
        "store_id": m.store_id,
        "total_intake_pieces": m.total_intake_pieces,
        "initial_gross_weight": m.initial_gross_weight,
        "estimated_fine_weight": m.estimated_fine_weight,
        "post_melt_gross_weight": m.post_melt_gross_weight,
        "tested_purity": m.tested_purity,
        "recovered_fine_weight": m.recovered_fine_weight,
        "melting_loss_weight": m.melting_loss_weight,
        "residue_scrap_weight": m.residue_scrap_weight,
        "melting_date": m.melting_date.isoformat() if m.melting_date else None,
        "melted_by": m.melted_by,
        "approved_by": m.approved_by,
        "status": m.status,
        "notes": m.notes,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def list_melting_lots(
    session: Session, company_id: str, *, status: str | None = None
) -> list[dict[str, Any]]:
    stmt = select(JewelryMeltingLot).where(JewelryMeltingLot.company_id == company_id)
    if status:
        stmt = stmt.where(JewelryMeltingLot.status == status)
    rows = session.exec(stmt.order_by(JewelryMeltingLot.created_at.desc())).all()  # type: ignore[attr-defined]
    return [_melting_lot_out(r) for r in rows]


def create_melting_lot(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    gross = float(body.get("initial_gross_weight") or 0)
    est_fine = float(body.get("estimated_fine_weight") or (gross * 0.916))

    lot = JewelryMeltingLot(
        company_id=auth.company_id,
        lot_no=_next_no(session, auth.company_id, "MLOT", JewelryMeltingLot, "lot_no"),
        store_id=body.get("store_id") or auth.store_id,
        total_intake_pieces=int(body.get("total_intake_pieces") or 1),
        initial_gross_weight=gross,
        estimated_fine_weight=est_fine,
        status="draft",
        melted_by=body.get("melted_by") or auth.user_id,
        notes=body.get("notes"),
    )
    session.add(lot)
    session.flush()
    write_audit(session, auth, "jewelry_melting_lot_create", "jewelry_melting_lot", lot.id)
    session.flush()
    return _melting_lot_out(lot)


def process_melting_lot(
    session: Session, auth: AuthContext, lot_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    lot = session.get(JewelryMeltingLot, lot_id)
    if not lot or lot.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Melting lot not found")

    post_gross = float(body.get("post_melt_gross_weight") or 0)
    tested_purity = float(body.get("tested_purity") if body.get("tested_purity") is not None else 0.916)
    recovered_fine = round(post_gross * tested_purity, 4)
    residue = float(body.get("residue_scrap_weight") or 0)
    loss = round(max(0, lot.estimated_fine_weight - recovered_fine), 4)

    lot.post_melt_gross_weight = post_gross
    lot.tested_purity = tested_purity
    lot.recovered_fine_weight = recovered_fine
    lot.residue_scrap_weight = residue
    lot.melting_loss_weight = loss
    lot.status = "completed"
    lot.approved_by = auth.user_id

    session.add(lot)
    session.flush()
    write_audit(session, auth, "jewelry_melting_lot_process", "jewelry_melting_lot", lot.id, {"recovered_fine": recovered_fine, "loss": loss})
    session.flush()
    return _melting_lot_out(lot)


# ── Store Exchange Credits Services ───────────────────────────────────────────

def _exchange_credit_out(c: JewelryExchangeCredit) -> dict[str, Any]:
    return {
        "id": c.id,
        "credit_code": c.credit_code,
        "customer_id": c.customer_id,
        "customer_name": c.customer_name,
        "customer_phone": c.customer_phone,
        "buyback_id": c.buyback_id,
        "initial_credit_amount": c.initial_credit_amount,
        "remaining_balance": c.remaining_balance,
        "issue_date": c.issue_date.isoformat() if c.issue_date else None,
        "expiry_date": c.expiry_date.isoformat() if c.expiry_date else None,
        "status": c.status,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def list_exchange_credits(
    session: Session, company_id: str, *, status: str | None = None, q: str | None = None
) -> list[dict[str, Any]]:
    stmt = select(JewelryExchangeCredit).where(JewelryExchangeCredit.company_id == company_id)
    if status:
        stmt = stmt.where(JewelryExchangeCredit.status == status)
    rows = session.exec(stmt.order_by(JewelryExchangeCredit.issue_date.desc())).all()  # type: ignore[attr-defined]
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for c in rows:
        row = _exchange_credit_out(c)
        if q_lower:
            hay = f"{c.credit_code} {c.customer_name} {c.customer_phone or ''}".lower()
            if q_lower not in hay:
                continue
        out.append(row)
    return out


def create_exchange_credit(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    amount = float(body.get("amount") or body.get("initial_credit_amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Credit amount must be greater than 0")

    credit = JewelryExchangeCredit(
        company_id=auth.company_id,
        credit_code=_next_no(session, auth.company_id, "EXC", JewelryExchangeCredit, "credit_code"),
        customer_id=body.get("customer_id"),
        customer_name=str(body.get("customer_name") or ""),
        customer_phone=body.get("customer_phone"),
        buyback_id=body.get("buyback_id"),
        initial_credit_amount=amount,
        remaining_balance=amount,
        status="active",
        notes=body.get("notes"),
    )
    session.add(credit)
    session.flush()
    write_audit(session, auth, "jewelry_exchange_credit_create", "jewelry_exchange_credit", credit.id, {"amount": amount})
    session.flush()
    return _exchange_credit_out(credit)


def get_exchange_credit_balance(session: Session, company_id: str, code: str) -> dict[str, Any]:
    credit = session.exec(
        select(JewelryExchangeCredit).where(
            JewelryExchangeCredit.company_id == company_id,
            JewelryExchangeCredit.credit_code == code.strip(),
        )
    ).first()
    if not credit:
        raise HTTPException(status_code=404, detail="Exchange credit voucher not found")
    return _exchange_credit_out(credit)


def redeem_exchange_credit(
    session: Session, auth: AuthContext, code: str, redeem_amount: float
) -> dict[str, Any]:
    credit = session.exec(
        for_update(
            session,
            select(JewelryExchangeCredit).where(
                JewelryExchangeCredit.company_id == auth.company_id,
                JewelryExchangeCredit.credit_code == code.strip(),
            ),
        )
    ).first()
    if not credit:
        raise HTTPException(status_code=404, detail="Exchange credit voucher not found")
    if credit.status not in {"active", "partially_used"}:
        raise HTTPException(status_code=400, detail=f"Credit voucher is {credit.status}")
    if redeem_amount > credit.remaining_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Redeem amount ({redeem_amount}) exceeds available balance ({credit.remaining_balance})",
        )

    credit.remaining_balance = round(credit.remaining_balance - redeem_amount, 2)
    if credit.remaining_balance <= 0.01:
        credit.status = "fully_redeemed"
    else:
        credit.status = "partially_used"

    session.add(credit)
    session.flush()
    write_audit(
        session,
        auth,
        "jewelry_exchange_credit_redeem",
        "jewelry_exchange_credit",
        credit.id,
        {"redeemed": redeem_amount, "remaining": credit.remaining_balance},
    )
    session.flush()
    return _exchange_credit_out(credit)


# ── Consolidated Fine-Gold Stock Position Report ──────────────────────────────

def get_fine_gold_position_report(session: Session, company_id: str) -> dict[str, Any]:
    """Live audit of Fine Gold (24K Equivalent) across all locations."""
    # 1. Retail Showcase & Counter Stock (Active Certificates)
    certs = session.exec(
        select(JewelryCertificate).where(
            JewelryCertificate.company_id == company_id,
            JewelryCertificate.status == "active",
        )
    ).all()
    counter_fine = sum(calculate_fine_gold_weight(c.net_metal_weight or c.weight_gram, c.purity) for c in certs)

    # 2. Karigars / WIP (Issued Fine Gold in open work orders)
    open_wos = session.exec(
        select(JewelryWorkOrder).where(
            JewelryWorkOrder.company_id == company_id,
            JewelryWorkOrder.status.in_(["issued", "in_progress", "qc"]),  # type: ignore[attr-defined]
        )
    ).all()
    wip_fine = sum(wo.issued_fine_weight - (wo.returned_fine_weight + wo.recovered_fine_weight) for wo in open_wos)

    # 3. Old Gold Stock (Draft/Assessed Buybacks + Melting Lots)
    buybacks = session.exec(
        select(JewelryBuyback).where(
            JewelryBuyback.company_id == company_id,
            JewelryBuyback.status.in_(["draft", "assessed", "approved"]),  # type: ignore[attr-defined]
        )
    ).all()
    old_gold_fine = sum(calculate_fine_gold_weight(b.net_metal_weight, b.purity) for b in buybacks)

    melting_lots = session.exec(
        select(JewelryMeltingLot).where(
            JewelryMeltingLot.company_id == company_id,
            JewelryMeltingLot.status == "in_process",
        )
    ).all()
    melting_fine = sum(m.estimated_fine_weight for m in melting_lots)

    total_fine_grams = round(counter_fine + wip_fine + old_gold_fine + melting_fine, 4)

    # Valuation at 24K selling rate
    rate_24k = get_effective_rate(session, company_id, metal_type="Gold", karat="24K")
    price_per_gram = float(rate_24k.get("selling_rate") or 11000)
    total_market_value = round(total_fine_grams * price_per_gram, 2)

    return {
        "summary": {
            "total_fine_gold_grams": total_fine_grams,
            "total_fine_gold_bhori": grams_to_bhori(total_fine_grams),
            "estimated_market_value": total_market_value,
            "reference_24k_rate": price_per_gram,
        },
        "breakdown": {
            "showcase_counter_stock": {
                "fine_gold_grams": round(counter_fine, 4),
                "bhori": grams_to_bhori(counter_fine),
                "item_count": len(certs),
            },
            "karigar_wip_stock": {
                "fine_gold_grams": round(wip_fine, 4),
                "bhori": grams_to_bhori(wip_fine),
                "open_jobs_count": len(open_wos),
            },
            "old_gold_vault": {
                "fine_gold_grams": round(old_gold_fine, 4),
                "bhori": grams_to_bhori(old_gold_fine),
                "intake_count": len(buybacks),
            },
            "melting_lots": {
                "fine_gold_grams": round(melting_fine, 4),
                "bhori": grams_to_bhori(melting_fine),
                "lots_count": len(melting_lots),
            },
        },
    }



