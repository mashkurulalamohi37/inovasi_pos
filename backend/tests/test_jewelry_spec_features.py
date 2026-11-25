"""Tests for Jewelry Gold Shop ERP features according to Project Specification."""

import pytest
from sqlmodel import Session

from app.dependencies import AuthContext
from app.models.core import Company, UserAccount
from app.services.jewelry_service import (
    bhori_to_grams,
    calculate_fine_gold_weight,
    complete_and_tag_work_order,
    create_custom_order,
    create_exchange_credit,
    create_karigar,
    create_karigar_bill,
    create_melting_lot,
    create_metal_rate,
    create_work_order,
    deliver_custom_order,
    get_exchange_credit_balance,
    get_fine_gold_position_report,
    get_karigar_ledger,
    get_purity_factor,
    grams_to_bhori,
    issue_material_to_work_order,
    pay_karigar_bill,
    process_melting_lot,
    reconcile_work_order,
    record_order_advance,
    record_production_recovery,
    redeem_exchange_credit,
    return_material_from_work_order,
)


@pytest.fixture
def auth_ctx(session: Session) -> AuthContext:
    company = Company(name="Rahman Jewellers Ltd", code="RJL-TEST")
    session.add(company)
    session.flush()

    user = UserAccount(
        company_id=company.id,
        email="owner@rahmanjewellers.com",
        username="rahman_owner",
        full_name="Al-Haj Rahman",
        password_hash="fakehash",
    )
    session.add(user)
    session.flush()

    return AuthContext(
        user_id=user.id,
        company_id=company.id,
        store_id=None,
        role_id="role-admin",
        role_code="admin",
        email=user.email,
        permissions={"*"},
        is_platform_admin=True,
    )


def test_traditional_bangladeshi_units_converter():
    # 1 Bhori = 11.664 grams
    conv1 = grams_to_bhori(11.664)
    assert conv1["bhori"] == 1
    assert conv1["ana"] == 0
    assert conv1["roti"] == 0
    assert conv1["total_bhori"] == 1.0

    # 11.664g / 2 = 5.832g = 0.5 Bhori = 8 Ana
    conv2 = grams_to_bhori(5.832)
    assert conv2["bhori"] == 0
    assert conv2["ana"] == 8
    assert conv2["total_bhori"] == 0.5

    # Reverse: 1 Bhori 4 Ana = 1.25 Bhori = 1.25 * 11.664 = 14.58g
    g = bhori_to_grams(bhori=1, ana=4)
    assert abs(g - 14.58) < 0.001


def test_purity_factors_and_fine_gold_calculations():
    assert abs(get_purity_factor("24K") - 1.0) < 0.0001
    assert abs(get_purity_factor("22K") - 0.916667) < 0.001
    assert abs(get_purity_factor("21K") - 0.875) < 0.001
    assert abs(get_purity_factor("18K") - 0.75) < 0.001

    # 10g of 22K gold has 9.1667g fine gold
    fine = calculate_fine_gold_weight(10.0, "22K")
    assert abs(fine - 9.1667) < 0.001


def test_karigar_lifecycle_and_work_order_reconciliation(session: Session, auth_ctx: AuthContext):
    # 1. Create Karigar
    karigar = create_karigar(
        session,
        auth_ctx,
        {
            "name": "Gourango Karikar",
            "phone": "01711223344",
            "artisan_type": "internal",
            "specialty": "filigree",
            "default_making_rate": 800.0,
            "default_rate_type": "per_gram",
        },
    )
    assert karigar["id"]
    assert karigar["fine_gold_balance"] == 0.0

    # 2. Create Work Order (Target: 10g 22K Bangle)
    wo = create_work_order(
        session,
        auth_ctx,
        {
            "design_name": "Bridal Gold Bangle 22K",
            "item_category": "Bangle",
            "karat": "22K",
            "target_gross_weight": 11.664,  # 1 Bhori
            "karigar_id": karigar["id"],
            "allowed_loss_percentage": 2.0,
        },
    )
    assert wo["work_order_no"].startswith("WO-")

    # 3. Issue Material (Issue 12.0g of 22K Gold Bar -> 11.0g Fine Gold)
    wo_updated = issue_material_to_work_order(
        session,
        auth_ctx,
        wo["id"],
        {
            "karigar_id": karigar["id"],
            "gross_weight": 12.0,
            "karat": "22K",
            "item_type": "raw_gold",
        },
    )
    issued_fine = wo_updated["issued_fine_weight"]
    assert issued_fine > 10.0

    # Check Karigar balance updated
    ledger = get_karigar_ledger(session, auth_ctx.company_id, karigar["id"])
    assert ledger["summary"]["current_balance_fine_grams"] == issued_fine

    # 4. Return Unused Material (Return 0.5g 22K metal -> ~0.458g fine)
    wo_updated = return_material_from_work_order(
        session,
        auth_ctx,
        wo["id"],
        {
            "gross_weight": 0.5,
            "karat": "22K",
        },
    )
    assert wo_updated["returned_fine_weight"] > 0

    # 5. Record Recovery (Recover 0.3g polish dust at 80% purity = 0.24g fine)
    wo_updated = record_production_recovery(
        session,
        auth_ctx,
        wo["id"],
        {
            "gross_weight": 0.3,
            "tested_purity": 0.80,
            "recovery_type": "polish_dust",
        },
    )
    assert wo_updated["recovered_fine_weight"] > 0

    # 6. Reconcile Work Order with Finished Output (11.0g 22K Finished Ornament)
    reconciled = reconcile_work_order(
        session,
        auth_ctx,
        wo["id"],
        {
            "finished_gross_weight": 11.0,
            "finished_net_weight": 11.0,
        },
    )
    assert reconciled["is_reconciled"] is True
    assert reconciled["status"] == "qc"

    # 7. Complete and Generate Unique Tag
    completed = complete_and_tag_work_order(
        session,
        auth_ctx,
        wo["id"],
        {"tag_no": "TAG-TEST-001"},
    )
    assert completed["status"] == "completed"
    assert completed["tag_no"] == "TAG-TEST-001"

    # 8. Create Karigar Bill and Pay
    bill = create_karigar_bill(
        session,
        auth_ctx,
        {
            "karigar_id": karigar["id"],
            "work_order_id": wo["id"],
            "total_weight_gram": 11.0,
            "rate_per_gram": 800.0,
        },
    )
    assert bill["net_payable"] == 8800.0
    assert bill["payment_status"] == "unpaid"

    paid_bill = pay_karigar_bill(
        session,
        auth_ctx,
        bill["id"],
        {"amount": 8800.0, "payment_ref": "CASH-TXN-01"},
    )
    assert paid_bill["payment_status"] == "paid"


def test_custom_customer_order_and_advance(session: Session, auth_ctx: AuthContext):
    # Set metal rate
    create_metal_rate(
        session,
        auth_ctx,
        {
            "metal_type": "Gold",
            "karat": "22K",
            "selling_rate": 10000.0,
            "buying_rate": 9200.0,
        },
    )

    # 1. Create Custom Order with Advance
    co = create_custom_order(
        session,
        auth_ctx,
        {
            "customer_name": "Farhana Sultana",
            "customer_phone": "01819998877",
            "design_name": "Peacock Necklace 22K",
            "target_gross_weight": 20.0,
            "making_charge_rate": 1000.0,
            "making_charge_type": "per_gram",
            "rate_lock_policy": "locked",
            "initial_advance": 50000.0,
        },
    )
    assert co["order_no"].startswith("JORD-")
    assert co["advance_paid"] == 50000.0
    assert co["status"] == "confirmed"

    # 2. Record Additional Advance
    co_updated = record_order_advance(
        session,
        auth_ctx,
        co["id"],
        {
            "amount": 20000.0,
            "payment_mode": "mfs",
            "transaction_ref": "BKASH-ADV-99",
        },
    )
    assert co_updated["advance_paid"] == 70000.0

    # 3. Deliver Order with actual finished weight (20.5g)
    delivered = deliver_custom_order(
        session,
        auth_ctx,
        co["id"],
        {
            "final_gross_weight": 20.5,
            "final_net_weight": 20.5,
            "balance_paid": 166775.0,
        },
    )
    assert delivered["status"] == "delivered"
    assert delivered["final_gross_weight"] == 20.5
    assert delivered["final_total_amount"] > 200000.0


def test_old_gold_melting_lot_and_exchange_credit(session: Session, auth_ctx: AuthContext):
    # 1. Create Melting Lot
    lot = create_melting_lot(
        session,
        auth_ctx,
        {
            "total_intake_pieces": 5,
            "initial_gross_weight": 50.0,
            "estimated_fine_weight": 45.0,
        },
    )
    assert lot["lot_no"].startswith("MLOT-")
    assert lot["status"] == "draft"

    # 2. Process Melt
    melted = process_melting_lot(
        session,
        auth_ctx,
        lot["id"],
        {
            "post_melt_gross_weight": 48.0,
            "tested_purity": 0.92,
            "residue_scrap_weight": 0.5,
        },
    )
    assert melted["status"] == "completed"
    assert melted["recovered_fine_weight"] > 44.0

    # 3. Create Exchange Credit Voucher
    credit = create_exchange_credit(
        session,
        auth_ctx,
        {
            "customer_name": "Nafisa Rahman",
            "amount": 35000.0,
        },
    )
    assert credit["credit_code"].startswith("EXC-")
    assert credit["remaining_balance"] == 35000.0

    # 4. Check Balance & Redeem
    bal = get_exchange_credit_balance(session, auth_ctx.company_id, credit["credit_code"])
    assert bal["remaining_balance"] == 35000.0

    redeemed = redeem_exchange_credit(session, auth_ctx, credit["credit_code"], 15000.0)
    assert redeemed["remaining_balance"] == 20000.0
    assert redeemed["status"] == "partially_used"


def test_fine_gold_position_report(session: Session, auth_ctx: AuthContext):
    pos = get_fine_gold_position_report(session, auth_ctx.company_id)
    assert "summary" in pos
    assert "breakdown" in pos
    assert "showcase_counter_stock" in pos["breakdown"]
    assert "karigar_wip_stock" in pos["breakdown"]
    assert "old_gold_vault" in pos["breakdown"]
