import pytest
from sqlmodel import Session, select
from app.models.industry import TailoringAlterationJob, TailorCommissionLedger, CustomerFabricIntake
from app.models.sales import SalesInvoice, SalesInvoiceLine
from app.models.product import ProductVariant, Product

def test_tailoring_measurements_save(auth_headers, client, session: Session):
    # 1. Create a tailoring job
    job = TailoringAlterationJob(
        company_id="1",  # PULSE-DEMO company ID in seed
        job_no="ALT-TEST-99",
        customer_name="Test Customer",
        garment_type="Shirt",
        alteration_task="Hem",
        master_name="Karim Master",
        status="pending",
        amount=100.0,
    )
    # Find active company to link
    from app.models.core import Company
    company = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).first()
    assert company is not None
    job.company_id = company.id
    session.add(job)
    session.commit()
    session.refresh(job)

    # 2. Patch the measurement note via API
    res = client.patch(
        f"/api/v1/industry/tailoring/alterations/{job.id}",
        headers=auth_headers,
        json={"measurement_note": "Chest 40, sleeve 25"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["measurement_note"] == "Chest 40, sleeve 25"

    # Verify db
    db_job = session.get(TailoringAlterationJob, job.id)
    assert db_job.measurement_note == "Chest 40, sleeve 25"


def test_tailor_commission_ledgering(auth_headers, client, session: Session):
    from app.models.core import Company
    company = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).first()
    
    # 1. Create a tailoring job
    job = TailoringAlterationJob(
        company_id=company.id,
        job_no="ALT-TEST-100",
        customer_name="Test Customer 2",
        garment_type="Shirt",
        alteration_task="Hem",
        master_name="Karim Master",
        status="pending",
        amount=200.0,
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    # 2. Mark the job as collected
    res = client.patch(
        f"/api/v1/industry/tailoring/alterations/{job.id}",
        headers=auth_headers,
        json={"status": "collected"},
    )
    assert res.status_code == 200

    # 3. Verify tailor_commission_ledger contains a matching entry
    comm = session.exec(
        select(TailorCommissionLedger).where(
            TailorCommissionLedger.company_id == company.id,
            TailorCommissionLedger.job_id == job.id
        )
    ).first()
    assert comm is not None
    assert comm.tailor_name == "Karim Master"
    assert comm.job_amount == 200.0
    assert comm.payout_amount == 30.0  # 15% of 200
    assert comm.status == "unpaid"

    # 4. Pay the commission via API
    pay_res = client.post(
        f"/api/v1/industry/tailoring/commissions/{comm.id}/pay",
        headers=auth_headers,
        json={},
    )
    assert pay_res.status_code == 200
    assert pay_res.json()["status"] == "paid"

    # Verify paid in db
    session.refresh(comm)
    assert comm.status == "paid"


def test_customer_fabric_intake_crud(auth_headers, client, session: Session):
    from app.models.core import Company
    company = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).first()

    # 1. Create fabric intake record
    res = client.post(
        "/api/v1/industry/tailoring/fabrics",
        headers=auth_headers,
        json={
            "customer_name": "Fabric Buyer",
            "customer_phone": "019999999",
            "description": "5m Blue Cotton",
            "status": "received",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["customer_name"] == "Fabric Buyer"
    assert data["description"] == "5m Blue Cotton"
    fabric_id = data["id"]

    # 2. List fabrics
    list_res = client.get(
        "/api/v1/industry/tailoring/fabrics",
        headers=auth_headers,
    )
    assert list_res.status_code == 200
    fabrics = list_res.json()
    assert any(f["id"] == fabric_id for f in fabrics)

    # 3. Patch fabric status
    patch_res = client.patch(
        f"/api/v1/industry/tailoring/fabrics/{fabric_id}",
        headers=auth_headers,
        json={"status": "cutting", "description": "5m Blue Cotton (trimmed)"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "cutting"
    assert patch_res.json()["description"] == "5m Blue Cotton (trimmed)"


def test_cross_product_exchange(auth_headers, client, session: Session):
    from app.models.core import Company, Store
    company = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).first()
    store = session.exec(select(Store).where(Store.company_id == company.id)).first()
    assert store is not None

    # 1. Find or create two different fashion products
    prod1 = session.exec(select(Product).where(Product.company_id == company.id, Product.sku == "FASH-001")).first()
    prod2 = session.exec(select(Product).where(Product.company_id == company.id, Product.sku == "FASH-002")).first()
    
    # Get variants for each product
    v1 = session.exec(select(ProductVariant).where(ProductVariant.product_id == prod1.id)).first()
    v2 = session.exec(select(ProductVariant).where(ProductVariant.product_id == prod2.id)).first()
    
    # 2. Create a SalesInvoice selling variant 1 of product 1
    from app.models.sales import SalesInvoice, SalesInvoiceLine
    inv = SalesInvoice(
        company_id=company.id,
        store_id=store.id,
        invoice_number="INV-EX-TEST-1",
        client_transaction_id="tx-ex-test-1",
        industry_pack="fashion",
        status="completed",
        subtotal=100.0,
        total=100.0,
    )
    session.add(inv)
    session.flush()

    line = SalesInvoiceLine(
        invoice_id=inv.id,
        product_id=prod1.id,
        sku=prod1.sku,
        name=prod1.name,
        qty=1.0,
        unit_price=100.0,
        line_total=100.0,
        meta_json=f'{{"variant_id": "{v1.id}"}}',
    )
    session.add(line)
    session.commit()

    # 3. Perform exchange of Product 1 Variant 1 for Product 2 Variant 2
    res = client.post(
        f"/api/v1/sales/{inv.id}/exchange",
        headers=auth_headers,
        json={
            "reason": "Style size/style mismatch",
            "condition": "saleable",
            "return_lines": [
                {
                    "invoice_line_id": line.id,
                    "qty": 1.0,
                    "meta": {"variant_id": v1.id},
                }
            ],
            "new_lines": [
                {
                    "variant_id": v2.id,
                    "qty": 1.0,
                }
            ],
        },
    )
    assert res.status_code == 200
    assert "exchange_no" in res.json()
