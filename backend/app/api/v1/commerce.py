import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select, func

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.product import Product
from app.schemas.commerce import (
    CustomerCreate,
    CustomerUpdate,
    DueCollectionIn,
    HeldSaleCompleteIn,
    ProductCreate,
    ProductDeleteIn,
    ProductOut,
    ProductUpdate,
    SaleCreate,
    SaleOut,
)
from app.schemas.common import PaginatedResponse
from app.schemas.product_catalog import ProductDetailOut, BarcodeLookupOut
from app.services.customer_service import (
    collect_due,
    create_customer,
    get_customer,
    get_customer_ledger,
    get_loyalty_summary,
    list_customers,
    loyalty_redeem_preview,
    update_customer,
)
from app.services.product_service import (
    _product_out,
    _validate_master,
    barcode_exists,
    delete_product,
    get_product_detail,
    lookup_by_barcode,
    search_products,
    update_product_extended,
)
from app.services.sales_service import (
    cancel_held_sale,
    complete_held_sale,
    create_sale_idempotent,
    get_sale,
    get_sync_status,
    list_held_sales,
    list_sales,
)

router = APIRouter(tags=["commerce"])


@router.get("/products")
def list_products(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    industry_pack: Optional[str] = None,
    q: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=50000),
    limit: Optional[int] = Query(None, ge=1, le=50000),
):
    effective_page_size = limit or page_size
    clean_industry = industry_pack if industry_pack and industry_pack.lower() != "all" else None
    products = search_products(
        session,
        auth.company_id,
        industry_pack=clean_industry,
        q=q,
        status=status,
        category_id=category_id,
        brand_id=brand_id,
    )
    total = len(products)
    start = (page - 1) * effective_page_size
    page_items = products[start : start + effective_page_size]
    pages = max(1, (total + effective_page_size - 1) // effective_page_size)
    return PaginatedResponse(
        items=[_product_out(p, session) for p in page_items],
        total=total,
        page=page,
        page_size=effective_page_size,
        pages=pages,
    )


@router.get("/products/barcode/{barcode}", response_model=BarcodeLookupOut)
def lookup_barcode(
    barcode: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return lookup_by_barcode(session, auth.company_id, barcode)


@router.post("/products/upload-image")
async def upload_product_image(
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    file: UploadFile = File(...),
):
    # Validate extension
    import os
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPG, JPEG, WEBP or GIF.")
        
    # Read content to check size (5MB maximum)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit.")
        
    # Generate unique filename
    import uuid
    import time
    unique_filename = f"prod_{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    
    save_path = os.path.join("uploads", "products", unique_filename)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    
    # Save the file
    with open(save_path, "wb") as f:
        f.write(content)
        
    return {"url": f"/uploads/products/{unique_filename}"}


@router.post("/products", response_model=ProductOut)
def create_product(
    body: ProductCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    if body.cost_price is not None and not role_has(auth, "inventory.price"):
        raise HTTPException(status_code=403, detail="Permission required: inventory.price")
    existing_by_barcode = None
    if body.barcode:
        existing_by_barcode = session.exec(
            select(Product).where(
                Product.company_id == auth.company_id,
                Product.barcode == body.barcode,
            )
        ).first()

    existing_by_sku = None
    if body.sku:
        existing_by_sku = session.exec(
            select(Product).where(
                Product.company_id == auth.company_id,
                func.lower(Product.sku) == body.sku.lower(),
            )
        ).first()

    target_product = existing_by_barcode or existing_by_sku
    if target_product:
        from app.models.product import BrandMaster, ProductCategory, Unit

        if body.category_id:
            _validate_master(session, auth.company_id, ProductCategory, body.category_id, "category")
            target_product.category_id = body.category_id
        if body.brand_id:
            _validate_master(session, auth.company_id, BrandMaster, body.brand_id, "brand")
            target_product.brand_id = body.brand_id
        if body.unit_id:
            _validate_master(session, auth.company_id, Unit, body.unit_id, "unit")
            target_product.unit_id = body.unit_id

        if body.name:
            target_product.name = body.name
        if body.base_price is not None:
            target_product.base_price = body.base_price
        if body.cost_price is not None and role_has(auth, "inventory.price"):
            target_product.cost_price = body.cost_price
        if body.wholesale_price is not None and role_has(auth, "inventory.price"):
            target_product.wholesale_price = body.wholesale_price
        if body.barcode and not target_product.barcode:
            target_product.barcode = body.barcode
        if not target_product.is_active:
            target_product.is_active = True
            write_audit(session, auth, "product_activate", "product", target_product.id, {"sku": target_product.sku, "reason": "reactivate_on_update_or_readd"})

        meta = body.meta or {}
        if meta:
            try:
                curr_meta = json.loads(target_product.meta_json) if target_product.meta_json else {}
            except Exception:
                curr_meta = {}
            curr_meta.update(meta)
            target_product.meta_json = json.dumps(curr_meta)

        session.add(target_product)
        write_audit(session, auth, "product_update", "product", target_product.id, {"sku": target_product.sku, "reason": "auto_update_on_barcode_or_sku_match"})
        if target_product.industry_pack == "cosmetics" and meta:
            from app.services.cosmetics_service import sync_cosmetics_batch_from_meta
            sync_cosmetics_batch_from_meta(session, auth.company_id, target_product, meta)
        session.commit()
        session.refresh(target_product)
        return _product_out(target_product, session)

    from app.models.product import BrandMaster, ProductCategory, Unit

    _validate_master(session, auth.company_id, ProductCategory, body.category_id, "category")
    _validate_master(session, auth.company_id, BrandMaster, body.brand_id, "brand")
    _validate_master(session, auth.company_id, Unit, body.unit_id, "unit")
    meta = body.meta or {}
    if body.industry_pack == "fashion":
        from app.services.fashion_catalog_service import validate_fashion_meta

        meta = validate_fashion_meta(meta, require_style=False)
    product_sku = (body.sku or "").strip()
    if not product_sku:
        import uuid
        product_sku = f"SKU-{uuid.uuid4().hex[:8].upper()}"
    product = Product(
        company_id=auth.company_id,
        sku=product_sku,
        barcode=body.barcode,
        name=body.name,
        industry_pack=body.industry_pack,
        base_price=body.base_price,
        wholesale_price=body.wholesale_price,
        cost_price=body.cost_price,
        category_id=body.category_id,
        brand_id=body.brand_id,
        unit_id=body.unit_id,
        meta_json=json.dumps(meta),
    )
    session.add(product)
    write_audit(session, auth, "product_create", "product", product.id, {"sku": body.sku})
    if body.industry_pack == "cosmetics" and meta:
        from app.services.cosmetics_service import sync_cosmetics_batch_from_meta
        sync_cosmetics_batch_from_meta(session, auth.company_id, product, meta)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        fallback = None
        if body.barcode:
            fallback = session.exec(
                select(Product).where(
                    Product.company_id == auth.company_id,
                    Product.barcode == body.barcode,
                )
            ).first()
        if not fallback and body.sku:
            fallback = session.exec(
                select(Product).where(
                    Product.company_id == auth.company_id,
                    func.lower(Product.sku) == body.sku.lower(),
                )
            ).first()
        if fallback:
            return _product_out(fallback, session)
        raise HTTPException(status_code=409, detail="SKU or barcode already exists for another product")
    session.refresh(product)
    return _product_out(product, session)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str,
    body: ProductUpdate,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    if body.base_price is not None and not role_has(auth, "inventory.price"):
        raise HTTPException(status_code=403, detail="Permission required: inventory.price")
    editable = body.model_dump(exclude_unset=True)
    needs_edit = any(k in editable for k in ("name", "sku", "barcode", "is_active", "category_id", "brand_id", "unit_id", "meta", "wholesale_price", "cost_price"))
    if needs_edit and not role_has(auth, "inventory.edit"):
        raise HTTPException(status_code=403, detail="Permission required: inventory.edit")
    if body.base_price is not None:
        product = session.get(Product, product_id)
        if product and product.company_id == auth.company_id:
            write_audit(session, auth, "price_change", "product", product.id, {"old": product.base_price, "new": body.base_price})
    result = update_product_extended(session, auth, product_id, editable)
    session.commit()
    return result


def role_has(auth: AuthContext, perm: str) -> bool:
    from app.rbac import role_has_permission
    return role_has_permission(auth.role_code, perm)


@router.get("/products/{product_id}", response_model=ProductDetailOut)
def get_product(
    product_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_product_detail(session, auth.company_id, product_id)


@router.delete("/products/{product_id}")
def delete_product_endpoint(
    product_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
    body: Optional[ProductDeleteIn] = None,
    password: Optional[str] = Query(None),
):
    from app.models.core import UserAccount, Role, UserRole
    from app.security import verify_password

    admin_pw = (body.password if body else None) or password
    if not admin_pw or not admin_pw.strip():
        raise HTTPException(
            status_code=400,
            detail="Admin password is required to delete a product",
        )

    # 1. Verify password against current user if active
    current_user = session.get(UserAccount, auth.user_id) if auth.user_id else None
    pw_valid = False
    if current_user and current_user.password_hash:
        if verify_password(admin_pw, current_user.password_hash):
            pw_valid = True

    # 2. Or allow any active admin / tenant_admin / store_manager / platform_admin in the company
    if not pw_valid:
        admins = session.exec(
            select(UserAccount)
            .where(
                UserAccount.company_id == auth.company_id,
                UserAccount.is_active == True,
            )
        ).all()
        for admin_user in admins:
            if admin_user.password_hash and verify_password(admin_pw, admin_user.password_hash):
                if admin_user.is_platform_admin:
                    pw_valid = True
                    break
                roles = session.exec(
                    select(Role)
                    .join(UserRole, UserRole.role_id == Role.id)
                    .where(UserRole.user_id == admin_user.id)
                ).all()
                if any(r.code in ("admin", "tenant_admin", "owner", "store_manager") for r in roles):
                    pw_valid = True
                    break

    if not pw_valid:
        raise HTTPException(
            status_code=400,
            detail="Incorrect admin password. Deletion aborted for safety.",
        )

    result = delete_product(session, auth, product_id)
    session.commit()
    return result


@router.post("/sales", response_model=SaleOut)
def create_sale(
    body: SaleCreate,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    if body.status == "held":
        from app.rbac import role_has_permission
        if not role_has_permission(auth.role_code, "sales.hold"):
            raise HTTPException(status_code=403, detail="Permission required: sales.hold")
    elif body.status == "completed":
        from app.rbac import role_has_permission
        if not role_has_permission(auth.role_code, "sales.create"):
            raise HTTPException(status_code=403, detail="Permission required: sales.create")
    result = create_sale_idempotent(session, auth, body)
    session.commit()

    if getattr(result, "status", None) == "completed" and getattr(result, "grand_total", None):
        try:
            import asyncio
            from app.integrations.referral import referral_service
            pay_id = f"pay_{result.id[:12]}"
            sub_id = f"sub_sale_{auth.company_id[:8]}"
            gross_bdt = float(result.grand_total)
            asyncio.create_task(
                referral_service.emit_payment_succeeded_async(
                    payment_id=pay_id,
                    company_id=auth.company_id,
                    subscription_id=sub_id,
                    plan_code="pos_purchase",
                    amount_bdt=gross_bdt,
                    billing_reason="one_time",
                )
            )
        except Exception:
            pass

    return result


@router.get("/sales")
def sales_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    store_id: Optional[str] = None,
    cashier_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    industry_pack: Optional[str] = None,
    limit: int = 100,
):
    from app.access.store_scope import accessible_store_ids, assert_store_access

    if store_id:
        assert_store_access(session, auth, store_id)
    allowed = accessible_store_ids(session, auth)
    rows = list_sales(
        session,
        auth.company_id,
        status=status,
        customer_id=customer_id,
        store_id=store_id,
        cashier_id=cashier_id,
        from_date=from_date,
        to_date=to_date,
        industry_pack=industry_pack,
        limit=limit,
    )
    if allowed is not None and not store_id:
        rows = [r for r in rows if r.get("store_id") in allowed]
    return rows


@router.get("/sales/sync/{client_transaction_id}")
def sale_sync_status(
    client_transaction_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_sync_status(session, auth.company_id, client_transaction_id)


@router.get("/sales/policy")
def sales_policy(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.sales_policy_service import get_sales_policies

    return get_sales_policies(session, auth.company_id, auth.store_id)


@router.put("/sales/policy")
def update_sales_policy_endpoint(
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.sales_policy_service import update_sales_policy

    result = update_sales_policy(session, auth, body)
    session.commit()
    return result


@router.get("/pricing/price-list")
def price_list_index(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    store_id: Optional[str] = None,
):
    from app.services.sales_policy_service import list_price_list_entries

    return list_price_list_entries(session, auth.company_id, product_id, store_id)


@router.post("/pricing/price-list")
def price_list_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.price"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.sales_policy_service import create_price_list_entry

    return create_price_list_entry(session, auth, body)


@router.delete("/pricing/price-list/{entry_id}")
def price_list_delete(
    entry_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.price"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.sales_policy_service import delete_price_list_entry

    return delete_price_list_entry(session, auth, entry_id)


@router.get("/sales/history")
def sales_history(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
    limit: int = 50,
):
    target_store = store_id or auth.store_id
    rows = list_sales(session, auth.company_id, store_id=target_store, industry_pack=industry_pack, limit=limit)
    return [
        {
            "id": r["id"],
            "invoice_number": r["invoice_number"],
            "total": r["total"],
            "paid_amount": r["paid_amount"],
            "due_amount": r["due_amount"],
            "industry_pack": r["industry_pack"],
            "tender": r["tender"],
            "status": r["status"],
            "customer_id": r["customer_id"],
            "customer_name": r["customer_name"],
            "store_id": r["store_id"],
            "store_name": r["store_name"],
            "cashier_name": r["cashier_name"],
            "completed_at": r["completed_at"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@router.get("/sales/held/list")
def held_sales_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    from app.rbac import role_has_permission
    if not role_has_permission(auth.role_code, "sales.hold"):
        raise HTTPException(status_code=403, detail="Permission required: sales.hold")
    return list_held_sales(session, auth.company_id, store_id)


@router.get("/sales/{invoice_id}")
def sale_detail(
    invoice_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_sale(session, auth.company_id, invoice_id)


@router.post("/sales/{invoice_id}/complete")
def held_sale_complete(
    invoice_id: str,
    body: HeldSaleCompleteIn,
    auth: Annotated[AuthContext, Depends(require_permission("sales.hold"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = complete_held_sale(session, auth, invoice_id, body.model_dump())
    session.commit()
    return result


@router.delete("/sales/{invoice_id}/held")
def held_sale_cancel(
    invoice_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("sales.hold"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = cancel_held_sale(session, auth, invoice_id)
    session.commit()
    return result


@router.get("/customers")
def customers_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    customer_type: Optional[str] = None,
):
    return list_customers(session, auth.company_id, q, customer_type)


@router.post("/customers")
def customer_create(
    body: CustomerCreate,
    auth: Annotated[AuthContext, Depends(require_permission("sales.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_customer(session, auth, body.model_dump())
    session.commit()
    return result


@router.get("/customers/{customer_id}")
def customer_detail(
    customer_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_customer(session, auth.company_id, customer_id)


@router.patch("/customers/{customer_id}")
def customer_update(
    customer_id: str,
    body: CustomerUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("sales.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = update_customer(session, auth, customer_id, body.model_dump(exclude_unset=True))
    session.commit()
    return result


@router.get("/customers/{customer_id}/ledger")
def customer_ledger(
    customer_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    return get_customer_ledger(session, auth.company_id, customer_id, from_date, to_date)


@router.get("/customers/{customer_id}/loyalty")
def customer_loyalty(
    customer_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_loyalty_summary(session, auth.company_id, auth.store_id, customer_id)


@router.post("/customers/{customer_id}/loyalty/redeem-preview")
def customer_loyalty_redeem_preview(
    customer_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    points = float(body.get("points") or 0)
    return loyalty_redeem_preview(session, auth.company_id, auth.store_id, customer_id, points)


@router.post("/customer-payments")
def due_collection(
    body: DueCollectionIn,
    auth: Annotated[AuthContext, Depends(require_permission("sales.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = collect_due(session, auth, body.model_dump())
    session.commit()
    return result
