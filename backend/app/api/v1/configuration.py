import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.config_engine import (
    DynamicFieldDefinition,
    FeatureFlag,
    IndustryPack,
    MenuConfig,
    QaChecklistItem,
    ReceiptTemplate,
    ScreenConfig,
    TenantFeature,
)
from app.models.core import Permission, Role, RolePermission
from app.rbac import PERMISSIONS, role_has_permission
from app.schemas.configuration import (
    DynamicFieldCreate,
    DynamicFieldOut,
    FeatureFlagOut,
    FeatureFlagUpdate,
    PackConfigOut,
    PackConfigUpdate,
    QaItemOut,
    QaItemUpdate,
    ReceiptTemplateOut,
    ReceiptTemplateCreate,
    ReceiptTemplateUpdate,
    RolePermissionOut,
    RolePermissionUpdate,
    MenuConfigOut,
    MenuConfigPatch,
    PackActivationRequestIn,
    PackActivationRequestOut,
    ScreenConfigOut,
    ScreenConfigUpdate,
)
from app.schemas.master_data import TaxRuleCreate, TaxRuleUpdate

PACK_MENUS_KEY = "pack_menus"
from app.services.health_service import run_health_check
from app.cache import cache_get_or_set, cache_key, invalidate_company_config

router = APIRouter(prefix="/configuration", tags=["configuration"])


@router.get("/industry-packs", response_model=list[PackConfigOut])
def list_packs(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    def _load():
        packs = session.exec(select(IndustryPack).where(IndustryPack.company_id == auth.company_id)).all()
        return [
            {
                "industry_code": p.industry_code,
                "enabled_company": p.enabled_company,
                "enabled_store": p.enabled_store,
                "enabled_counter": p.enabled_counter,
            }
            for p in packs
        ]

    data = cache_get_or_set(cache_key("cfg", auth.company_id, "packs"), _load)
    return [PackConfigOut(**row) for row in data]


@router.patch("/industry-packs/{industry_code}", response_model=PackConfigOut)
def update_pack(
    industry_code: str,
    body: PackConfigUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.packs"))],
    session: Annotated[Session, Depends(get_session)],
):
    pack = session.exec(
        select(IndustryPack).where(
            IndustryPack.company_id == auth.company_id,
            IndustryPack.industry_code == industry_code,
        )
    ).first()
    if not pack:
        from app.seed import INDUSTRY_PACKS as KNOWN_PACKS
        if industry_code not in KNOWN_PACKS:
            raise HTTPException(status_code=404, detail="Pack not found")
        pack = IndustryPack(
            company_id=auth.company_id,
            industry_code=industry_code,
            enabled_company=False,
            enabled_store=False,
            enabled_counter=False,
            updated_by=auth.email,
        )
        session.add(pack)
        session.flush()
    if body.enabled_company is True and not pack.enabled_company:
        if not auth.is_platform_admin and auth.role_code != "super_admin":
            raise HTTPException(
                status_code=403,
                detail="Activating an inactive POS pack requires Super Admin approval. Please submit an activation request.",
            )
        from app.services.subscription_service import enforce_limit
        enforce_limit(session, auth.company_id, "industry_packs", 1)
    if body.enabled_company is not None:
        pack.enabled_company = body.enabled_company
    if body.enabled_store is not None:
        pack.enabled_store = body.enabled_store
    if body.enabled_counter is not None:
        pack.enabled_counter = body.enabled_counter
    pack.updated_by = auth.email
    session.add(pack)
    write_audit(session, auth, "pack_update", "industry_pack", pack.id, {"industry_code": industry_code})
    session.commit()
    invalidate_company_config(auth.company_id)
    return PackConfigOut(
        industry_code=pack.industry_code,
        enabled_company=pack.enabled_company,
        enabled_store=pack.enabled_store,
        enabled_counter=pack.enabled_counter,
    )


@router.post("/industry-packs/{industry_code}/request-activation", response_model=PackActivationRequestOut)
def request_pack_activation(
    industry_code: str,
    body: PackActivationRequestIn,
    auth: Annotated[AuthContext, Depends(require_permission("config.packs"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.saas import ApprovalRequest
    from app.models.core import Company, UserAccount

    # Check if already active
    pack = session.exec(
        select(IndustryPack).where(
            IndustryPack.company_id == auth.company_id,
            IndustryPack.industry_code == industry_code,
        )
    ).first()
    if pack and pack.enabled_company and pack.enabled_store and pack.enabled_counter:
        raise HTTPException(status_code=400, detail="This industry pack is already active")

    # Check if a request is already pending
    existing = session.exec(
        select(ApprovalRequest).where(
            ApprovalRequest.company_id == auth.company_id,
            ApprovalRequest.request_type == "industry_pack_activation",
            ApprovalRequest.entity_id == industry_code,
            ApprovalRequest.status == "pending",
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="An activation request for this pack is already pending approval")

    company = session.get(Company, auth.company_id)
    user = session.get(UserAccount, auth.user_id)
    company_name = company.name if company else "Company"

    req = ApprovalRequest(
        company_id=auth.company_id,
        request_type="industry_pack_activation",
        entity_type="industry_pack",
        entity_id=industry_code,
        requested_by=auth.user_id,
        status="pending",
        title=f"Request to enable {industry_code} for {company_name}",
        detail_json=json.dumps({
            "pack_code": industry_code,
            "company_name": company_name,
            "company_code": company.code if company else None,
            "note": body.note or "",
            "requested_by_email": auth.email,
        }),
    )
    session.add(req)
    write_audit(session, auth, "pack_activation_requested", "industry_pack", industry_code, {"note": body.note})
    session.commit()
    session.refresh(req)

    return PackActivationRequestOut(
        id=req.id,
        company_id=req.company_id,
        company_code=company.code if company else None,
        company_name=company_name,
        industry_code=industry_code,
        pack_name=industry_code,
        status=req.status,
        requested_by=req.requested_by,
        requested_by_name=user.full_name if user else auth.email,
        created_at=req.created_at,
        note=body.note,
    )


@router.get("/industry-packs/requests", response_model=list[PackActivationRequestOut])
def list_pack_activation_requests(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.saas import ApprovalRequest
    from app.models.core import Company, UserAccount

    company = session.get(Company, auth.company_id)
    user = session.get(UserAccount, auth.user_id)

    rows = session.exec(
        select(ApprovalRequest)
        .where(
            ApprovalRequest.company_id == auth.company_id,
            ApprovalRequest.request_type == "industry_pack_activation",
        )
        .order_by(ApprovalRequest.created_at.desc())
    ).all()

    out = []
    for r in rows:
        detail = json.loads(r.detail_json or "{}")
        out.append(
            PackActivationRequestOut(
                id=r.id,
                company_id=r.company_id,
                company_code=company.code if company else None,
                company_name=company.name if company else None,
                industry_code=r.entity_id or "",
                pack_name=detail.get("pack_name") or r.entity_id,
                status=r.status,
                requested_by=r.requested_by,
                requested_by_name=user.full_name if user else None,
                created_at=r.created_at,
                resolved_at=r.resolved_at,
                resolved_by=r.resolved_by,
                comment=r.comment,
                note=detail.get("note"),
            )
        )
    return out


@router.get("/feature-flags", response_model=list[FeatureFlagOut])
def list_flags(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    def _load():
        from app.seed import FEATURE_FLAGS as KNOWN_FLAGS

        flags = session.exec(select(FeatureFlag)).all()
        tenant = {
            t.flag_key: t.enabled
            for t in session.exec(select(TenantFeature).where(TenantFeature.company_id == auth.company_id)).all()
        }
        seen = {f.key for f in flags}
        rows = [
            {
                "key": f.key,
                "pack_code": f.pack_code,
                "label": f.label,
                "description": f.description,
                "enabled": tenant.get(f.key, f.default_enabled),
            }
            for f in flags
        ]
        for key, pack_code, label, default_enabled in KNOWN_FLAGS:
            if key not in seen:
                rows.append(
                    {
                        "key": key,
                        "pack_code": pack_code,
                        "label": label,
                        "description": label,
                        "enabled": tenant.get(key, default_enabled),
                    }
                )
        return rows

    data = cache_get_or_set(cache_key("cfg", auth.company_id, "flags"), _load)
    return [FeatureFlagOut(**row) for row in data]


@router.patch("/feature-flags/{flag_key}", response_model=FeatureFlagOut)
def update_flag(
    flag_key: str,
    body: FeatureFlagUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    flag_def = session.exec(select(FeatureFlag).where(FeatureFlag.key == flag_key)).first()
    if not flag_def:
        from app.seed import FEATURE_FLAGS as KNOWN_FLAGS
        matched = next((f for f in KNOWN_FLAGS if f[0] == flag_key), None)
        if not matched:
            raise HTTPException(status_code=404, detail="Flag not found")
        flag_def = FeatureFlag(
            key=matched[0],
            pack_code=matched[1],
            label=matched[2],
            description=matched[2],
            default_enabled=matched[3],
        )
        session.add(flag_def)
        session.flush()
    tf = session.exec(
        select(TenantFeature).where(
            TenantFeature.company_id == auth.company_id,
            TenantFeature.flag_key == flag_key,
        )
    ).first()
    if tf:
        tf.enabled = body.enabled
        tf.updated_by = auth.email
        session.add(tf)
    else:
        session.add(
            TenantFeature(company_id=auth.company_id, flag_key=flag_key, enabled=body.enabled, updated_by=auth.email)
        )
    write_audit(session, auth, "flag_update", "feature_flag", flag_key, {"enabled": body.enabled})
    session.commit()
    invalidate_company_config(auth.company_id)
    return FeatureFlagOut(
        key=flag_def.key,
        pack_code=flag_def.pack_code,
        label=flag_def.label,
        description=flag_def.description,
        enabled=body.enabled,
    )


def _field_out(f: DynamicFieldDefinition) -> DynamicFieldOut:
    return DynamicFieldOut(
        id=f.id,
        pack_code=f.pack_code,
        entity=f.entity,
        name=f.name,
        field_type=f.field_type,
        required=f.required,
        visible_in_pos=f.visible_in_pos,
        visible_in_product=f.visible_in_product,
        visible_in_receipt=f.visible_in_receipt,
        visible_in_report=f.visible_in_report,
        sort_order=f.sort_order,
        enabled=f.enabled,
        all_stores=f.all_stores,
        all_counters=f.all_counters,
        store_codes=json.loads(f.store_codes or "[]"),
        counter_codes=json.loads(f.counter_codes or "[]"),
        options=json.loads(f.options or "[]"),
    )


@router.get("/dynamic-fields", response_model=list[DynamicFieldOut])
def list_dynamic_fields(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    def _load():
        fields = session.exec(
            select(DynamicFieldDefinition)
            .where(DynamicFieldDefinition.company_id == auth.company_id)
            .order_by(DynamicFieldDefinition.sort_order)
        ).all()
        return [_field_out(f).model_dump() for f in fields]

    data = cache_get_or_set(cache_key("cfg", auth.company_id, "dynamic_fields"), _load)
    return [DynamicFieldOut(**row) for row in data]


@router.post("/dynamic-fields", response_model=DynamicFieldOut)
def create_dynamic_field(
    body: DynamicFieldCreate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    count = len(
        session.exec(
            select(DynamicFieldDefinition).where(DynamicFieldDefinition.company_id == auth.company_id)
        ).all()
    )
    field = DynamicFieldDefinition(
        company_id=auth.company_id,
        pack_code=body.pack_code,
        entity=body.entity,
        name=body.name,
        field_type=body.field_type,
        required=body.required,
        visible_in_pos=body.visible_in_pos,
        visible_in_product=body.visible_in_product,
        visible_in_receipt=body.visible_in_receipt,
        visible_in_report=body.visible_in_report,
        sort_order=count + 1,
        enabled=body.enabled,
        all_stores=body.all_stores,
        all_counters=body.all_counters,
        store_codes=json.dumps(body.store_codes),
        counter_codes=json.dumps(body.counter_codes),
        options=json.dumps(body.options),
    )
    session.add(field)
    session.commit()
    session.refresh(field)
    invalidate_company_config(auth.company_id)
    return _field_out(field)


@router.put("/dynamic-fields/order")
def reorder_dynamic_fields(
    ordered_ids: list[str],
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    for idx, fid in enumerate(ordered_ids):
        field = session.get(DynamicFieldDefinition, fid)
        if field and field.company_id == auth.company_id:
            field.sort_order = idx + 1
            session.add(field)
    session.commit()
    invalidate_company_config(auth.company_id)
    return {"ok": True}


def _load_pack_menus(session: Session, company_id: str) -> dict[str, dict[str, bool]]:
    row = session.exec(
        select(MenuConfig).where(
            MenuConfig.company_id == company_id,
            MenuConfig.menu_key == PACK_MENUS_KEY,
        )
    ).first()
    if not row or not row.config_json:
        return {}
    try:
        data = json.loads(row.config_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _save_pack_menus(session: Session, company_id: str, menus: dict[str, dict[str, bool]], updated_by: str) -> None:
    row = session.exec(
        select(MenuConfig).where(
            MenuConfig.company_id == company_id,
            MenuConfig.menu_key == PACK_MENUS_KEY,
        )
    ).first()
    payload = json.dumps(menus)
    if row:
        row.config_json = payload
        row.updated_by = updated_by
        session.add(row)
    else:
        session.add(
            MenuConfig(
                company_id=company_id,
                menu_key=PACK_MENUS_KEY,
                config_json=payload,
                updated_by=updated_by,
            )
        )


@router.get("/menu-config", response_model=MenuConfigOut)
def get_menu_config(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    menus = cache_get_or_set(
        cache_key("cfg", auth.company_id, "menu"),
        lambda: _load_pack_menus(session, auth.company_id),
    )
    return MenuConfigOut(menus=menus)


@router.patch("/menu-config", response_model=MenuConfigOut)
def patch_menu_config(
    body: MenuConfigPatch,
    auth: Annotated[AuthContext, Depends(require_permission("config.packs"))],
    session: Annotated[Session, Depends(get_session)],
):
    menus = _load_pack_menus(session, auth.company_id)
    pack = menus.setdefault(body.pack_code, {})
    pack[body.route_path] = body.enabled
    _save_pack_menus(session, auth.company_id, menus, auth.email)
    write_audit(
        session,
        auth,
        "menu_config_update",
        "menu_config",
        body.pack_code,
        {"route_path": body.route_path, "enabled": body.enabled},
    )
    session.commit()
    invalidate_company_config(auth.company_id)
    return MenuConfigOut(menus=menus)


@router.get("/screen-config/{screen_key}", response_model=ScreenConfigOut)
def get_screen_config(
    screen_key: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    try:
        row = session.exec(
            select(ScreenConfig).where(
                ScreenConfig.company_id == auth.company_id,
                ScreenConfig.screen_key == screen_key,
            )
        ).first()
        if not row or not row.config_json:
            return ScreenConfigOut(screen_key=screen_key, config={})
        cfg = json.loads(row.config_json)
        return ScreenConfigOut(screen_key=screen_key, config=cfg if isinstance(cfg, dict) else {})
    except Exception as e:
        session.rollback()
        import logging
        logging.warning("Failed to fetch screen_config for %s: %s", screen_key, e)
        return ScreenConfigOut(screen_key=screen_key, config={})


@router.put("/screen-config/{screen_key}", response_model=ScreenConfigOut)
def update_screen_config(
    screen_key: str,
    body: ScreenConfigUpdate,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    try:
        row = session.exec(
            select(ScreenConfig).where(
                ScreenConfig.company_id == auth.company_id,
                ScreenConfig.screen_key == screen_key,
            )
        ).first()
        payload = json.dumps(body.config)
        if row:
            row.config_json = payload
            session.add(row)
        else:
            row = ScreenConfig(
                company_id=auth.company_id,
                screen_key=screen_key,
                config_json=payload,
            )
            session.add(row)
        write_audit(
            session,
            auth,
            "screen_config_update",
            "screen_config",
            screen_key,
            {"screen_key": screen_key},
        )
        session.commit()
    except Exception as e:
        session.rollback()
        import logging
        logging.error("Failed to save screen_config for %s: %s", screen_key, e)
    return ScreenConfigOut(screen_key=screen_key, config=body.config)


@router.get("/role-permissions", response_model=list[RolePermissionOut])
def list_role_permissions(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    roles = session.exec(select(Role).where(Role.company_id == auth.company_id)).all()
    role_ids = {r.id for r in roles}
    # Scope overrides to THIS company's roles only — RolePermission has no company_id of
    # its own, so an unfiltered query here would key by role name (e.g. "Cashier") and leak
    # one tenant's overrides onto every other tenant's identically-named role.
    overrides = {
        (rp.role_id, p.code): rp.allowed
        for rp in session.exec(select(RolePermission).where(RolePermission.role_id.in_(role_ids))).all()
        for p in [session.get(Permission, rp.permission_id)]
        if p
    }
    out: list[RolePermissionOut] = []
    for role in roles:
        for code, _, _ in PERMISSIONS:
            if (role.id, code) in overrides:
                allowed = overrides[(role.id, code)]
            else:
                allowed = role_has_permission(role.code, code)
            out.append(RolePermissionOut(role_code=role.code, permission_code=code, allowed=allowed))
    return out


@router.put("/role-permissions")
def update_role_permission(
    body: RolePermissionUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    role = session.exec(
        select(Role).where(Role.company_id == auth.company_id, Role.code == body.role_code)
    ).first()
    perm = session.exec(select(Permission).where(Permission.code == body.permission_code)).first()
    if not role or not perm:
        raise HTTPException(status_code=404, detail="Role or permission not found")
    rp = session.exec(
        select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == perm.id)
    ).first()
    if rp:
        rp.allowed = body.allowed
        session.add(rp)
    else:
        session.add(RolePermission(role_id=role.id, permission_id=perm.id, allowed=body.allowed))
    write_audit(session, auth, "role_permission_update", "role_permission", role.id, body.model_dump())
    session.commit()
    return {"ok": True}


@router.get("/receipt-templates", response_model=list[ReceiptTemplateOut])
def list_receipt_templates(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    templates = session.exec(
        select(ReceiptTemplate).where(ReceiptTemplate.company_id == auth.company_id)
    ).all()
    return [
        ReceiptTemplateOut(
            id=t.id,
            pack_code=t.pack_code,
            name=t.name,
            brand_name=t.brand_name,
            tagline=t.tagline,
            address_lines=t.address_lines,
            footer_notes=t.footer_notes,
            paper_width_mm=t.paper_width_mm,
            is_default=t.is_default,
        )
        for t in templates
    ]


def _template_out(t: ReceiptTemplate) -> ReceiptTemplateOut:
    return ReceiptTemplateOut(
        id=t.id, pack_code=t.pack_code, name=t.name, brand_name=t.brand_name,
        tagline=t.tagline, address_lines=t.address_lines, footer_notes=t.footer_notes,
        paper_width_mm=t.paper_width_mm, is_default=t.is_default,
    )


@router.get("/receipt-templates/{template_id}", response_model=ReceiptTemplateOut)
def get_receipt_template(
    template_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    t = session.get(ReceiptTemplate, template_id)
    if not t or t.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_out(t)


@router.post("/receipt-templates", response_model=ReceiptTemplateOut)
def create_receipt_template(
    body: ReceiptTemplateCreate,
    auth: Annotated[AuthContext, Depends(require_permission("config.receipts"))],
    session: Annotated[Session, Depends(get_session)],
):
    t = ReceiptTemplate(company_id=auth.company_id, **body.model_dump())
    if body.is_default:
        existing = session.exec(
            select(ReceiptTemplate).where(
                ReceiptTemplate.company_id == auth.company_id,
                ReceiptTemplate.pack_code == body.pack_code,
            )
        ).all()
        for e in existing:
            e.is_default = False
            session.add(e)
    session.add(t)
    write_audit(session, auth, "receipt_template_create", "receipt_template", t.id)
    session.commit()
    session.refresh(t)
    return _template_out(t)


@router.put("/receipt-templates/{template_id}", response_model=ReceiptTemplateOut)
def update_receipt_template(
    template_id: str,
    body: ReceiptTemplateUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.receipts"))],
    session: Annotated[Session, Depends(get_session)],
):
    t = session.get(ReceiptTemplate, template_id)
    if not t or t.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Template not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    session.add(t)
    write_audit(session, auth, "receipt_template_update", "receipt_template", t.id)
    session.commit()
    session.refresh(t)
    return _template_out(t)


@router.delete("/receipt-templates/{template_id}")
def delete_receipt_template(
    template_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("config.receipts"))],
    session: Annotated[Session, Depends(get_session)],
):
    t = session.get(ReceiptTemplate, template_id)
    if not t or t.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Template not found")
    session.delete(t)
    write_audit(session, auth, "receipt_template_delete", "receipt_template", template_id)
    session.commit()
    return {"ok": True}


@router.post("/receipt-templates/{template_id}/set-default", response_model=ReceiptTemplateOut)
def set_default_receipt_template(
    template_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("config.receipts"))],
    session: Annotated[Session, Depends(get_session)],
):
    t = session.get(ReceiptTemplate, template_id)
    if not t or t.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Template not found")
    siblings = session.exec(
        select(ReceiptTemplate).where(
            ReceiptTemplate.company_id == auth.company_id,
            ReceiptTemplate.pack_code == t.pack_code,
        )
    ).all()
    for s in siblings:
        s.is_default = s.id == t.id
        session.add(s)
    write_audit(session, auth, "receipt_template_default", "receipt_template", t.id)
    session.commit()
    session.refresh(t)
    return _template_out(t)


@router.post("/receipt-templates/preview")
def preview_receipt_template(
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return {
        "preview": True,
        "brand_name": body.get("brand_name", "Pulse POS"),
        "tagline": body.get("tagline"),
        "footer_notes": body.get("footer_notes"),
        "sample_line": body.get("sample_line", "Sample item · ৳100"),
    }


@router.get("/health-check")
def health_check(
    auth: Annotated[AuthContext, Depends(require_permission("config.health"))],
    session: Annotated[Session, Depends(get_session)],
):
    return run_health_check(session, auth.company_id)


@router.get("/qa-checklist", response_model=list[QaItemOut])
def get_qa(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    items = session.exec(select(QaChecklistItem).where(QaChecklistItem.company_id == auth.company_id)).all()
    return [QaItemOut(test_id=i.test_id, status=i.status, notes=i.notes) for i in items]


@router.put("/qa-checklist/{test_id}", response_model=QaItemOut)
def update_qa(
    test_id: str,
    body: QaItemUpdate,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    item = session.exec(
        select(QaChecklistItem).where(
            QaChecklistItem.company_id == auth.company_id,
            QaChecklistItem.test_id == test_id,
        )
    ).first()
    if item:
        item.status = body.status
        item.notes = body.notes
        session.add(item)
    else:
        item = QaChecklistItem(company_id=auth.company_id, test_id=test_id, status=body.status, notes=body.notes)
        session.add(item)
    session.commit()
    session.refresh(item)
    return QaItemOut(test_id=item.test_id, status=item.status, notes=item.notes)


@router.get("/tax-rules")
def list_tax_rules(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.config_engine import TaxRule
    rows = session.exec(select(TaxRule).where(TaxRule.company_id == auth.company_id)).all()
    return [
        {"id": r.id, "name": r.name, "rate": r.rate, "rate_pct": round(r.rate * 100, 2), "is_active": r.is_active, "is_default": r.is_default}
        for r in rows
    ]


@router.post("/tax-rules")
def create_tax_rule(
    body: TaxRuleCreate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.config_engine import TaxRule
    if body.is_default:
        for existing in session.exec(select(TaxRule).where(TaxRule.company_id == auth.company_id)).all():
            existing.is_default = False
            session.add(existing)
    rule = TaxRule(
        company_id=auth.company_id,
        name=body.name,
        rate=body.rate,
        is_active=body.is_active,
        is_default=body.is_default,
    )
    session.add(rule)
    session.flush()
    write_audit(session, auth, "tax_rule_create", "tax_rule", rule.id)
    session.commit()
    session.refresh(rule)
    return {"id": rule.id, "name": rule.name, "rate": rule.rate, "rate_pct": round(rule.rate * 100, 2), "is_active": rule.is_active, "is_default": rule.is_default}


@router.patch("/tax-rules/{rule_id}")
def update_tax_rule(
    rule_id: str,
    body: TaxRuleUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.config_engine import TaxRule
    rule = session.get(TaxRule, rule_id)
    if not rule or rule.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Tax rule not found")
    if body.name is not None:
        rule.name = body.name
    if body.rate is not None:
        rule.rate = body.rate
    if body.is_active is not None:
        rule.is_active = body.is_active
    if body.is_default is True:
        for existing in session.exec(select(TaxRule).where(TaxRule.company_id == auth.company_id)).all():
            existing.is_default = existing.id == rule.id
            session.add(existing)
    elif body.is_default is False:
        rule.is_default = False
    session.add(rule)
    write_audit(session, auth, "tax_rule_update", "tax_rule", rule.id)
    session.commit()
    return {"id": rule.id, "name": rule.name, "rate": rule.rate, "rate_pct": round(rule.rate * 100, 2), "is_active": rule.is_active, "is_default": rule.is_default}


@router.post("/seed-demo-pos")
def seed_demo_pos_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Seed comprehensive demo products, images, and activate all 19 POS shops for the authenticated company."""
    from app.seed_account_pos import seed_pos_account

    res = seed_pos_account(
        session,
        company_id=auth.company_id,
        default_stock=100,
    )
    return {
        "ok": True,
        "message": f"Successfully seeded {res['total_products']} products across {res['packs_enabled']} POS shops with images and stock.",
        "data": res,
    }
