"""Configuration health check service."""

import json

from sqlmodel import Session, select

from app.models.config_engine import DynamicFieldDefinition, FeatureFlag, IndustryPack, ReceiptTemplate, TenantFeature
from app.models.product import Product


def run_health_check(session: Session, company_id: str) -> dict:
    items: list[dict] = []

    fields = session.exec(
        select(DynamicFieldDefinition).where(DynamicFieldDefinition.company_id == company_id)
    ).all()
    for f in fields:
        if not f.pack_code:
            items.append({
                "id": f"df-pack-{f.id}",
                "title": f"Dynamic field missing pack: {f.name}",
                "status": "failed",
                "message": "Assign an industry pack",
                "fix_link": "/app/configuration/dynamic-fields",
            })
        if not f.all_stores and not f.store_codes:
            items.append({
                "id": f"df-store-{f.id}",
                "title": f"Dynamic field missing store scope: {f.name}",
                "status": "warning",
                "message": "Assign stores or enable all stores",
                "fix_link": "/app/configuration/dynamic-fields",
            })

    tenant_flags = {
        t.flag_key: t.enabled
        for t in session.exec(select(TenantFeature).where(TenantFeature.company_id == company_id)).all()
    }
    flag_defs = session.exec(select(FeatureFlag)).all()
    fefo = tenant_flags.get("pharmacy.fefo", False)
    batch = tenant_flags.get("pharmacy.batch", True)
    if fefo and not batch:
        items.append({
            "id": "conflict-pharmacy-fefo",
            "title": "Pharmacy FEFO without batch tracking",
            "status": "failed",
            "message": "Enable pharmacy.batch or disable pharmacy.fefo",
            "fix_link": "/app/configuration/feature-flags",
        })

    beef_expiry = tenant_flags.get("beef.expiry", False)
    beef_batch = tenant_flags.get("beef.slaughter_batch", False)
    if beef_expiry and not beef_batch:
        items.append({
            "id": "conflict-beef-expiry",
            "title": "Beef expiry without batch tracking",
            "status": "warning",
            "message": "Enable beef.slaughter_batch for expiry tracking",
            "fix_link": "/app/configuration/feature-flags",
        })

    warranty = tenant_flags.get("electronics.warranty", True)
    serial = tenant_flags.get("electronics.serial", True)
    if warranty and not serial:
        items.append({
            "id": "conflict-electronics-warranty",
            "title": "Electronics warranty without serial tracking",
            "status": "failed",
            "message": "Enable serial tracking for warranty",
            "fix_link": "/app/configuration/feature-flags",
        })

    kot = tenant_flags.get("restaurant.kot", True)
    kds = tenant_flags.get("restaurant.kds", True)
    if kot and not kds:
        items.append({
            "id": "conflict-restaurant-kot",
            "title": "Restaurant KOT without kitchen display",
            "status": "warning",
            "message": "Enable restaurant.kds or disable KOT",
            "fix_link": "/app/configuration/feature-flags",
        })

    packs = session.exec(select(IndustryPack).where(IndustryPack.company_id == company_id)).all()
    for pack in packs:
        if not pack.enabled_company:
            continue
        products = session.exec(
            select(Product).where(Product.company_id == company_id, Product.industry_pack == pack.industry_code)
        ).first()
        if not products:
            items.append({
                "id": f"pack-products-{pack.industry_code}",
                "title": f"No products for enabled pack {pack.industry_code}",
                "status": "warning",
                "message": "Add sample products for this pack",
                "fix_link": "/app/products",
            })
        tmpl = session.exec(
            select(ReceiptTemplate).where(
                ReceiptTemplate.company_id == company_id,
                ReceiptTemplate.pack_code == pack.industry_code,
            )
        ).first()
        if not tmpl:
            items.append({
                "id": f"pack-receipt-{pack.industry_code}",
                "title": f"Missing receipt template for {pack.industry_code}",
                "status": "warning",
                "message": "Create pack-specific receipt template",
                "fix_link": "/app/configuration/receipt-templates",
            })

    passed = len([i for i in items if i["status"] == "passed"])
    failed = len([i for i in items if i["status"] == "failed"])
    warnings = len([i for i in items if i["status"] == "warning"])
    if not items:
        items.append({
            "id": "all-clear",
            "title": "All checks passed",
            "status": "passed",
            "message": "No configuration issues detected",
            "fix_link": None,
        })
        passed = 1

    return {
        "summary": {"passed": passed, "failed": failed, "warnings": warnings, "total": len(items)},
        "items": items,
    }
