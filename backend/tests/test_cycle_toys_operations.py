import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401
from app.dependencies import AuthContext
from app.services.cycle_toys_service import (
    create_assembly_order,
    create_battery_log,
    create_inspection_log,
    create_service_job,
    list_assembly_orders,
    list_battery_logs,
    list_inspection_logs,
    list_service_jobs,
    update_assembly_order,
    update_battery_log,
    update_service_job,
)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _auth(company_id: str = "comp-cycle-1", store_id: str = "store-1") -> AuthContext:
    return AuthContext(
        user_id="user-1",
        company_id=company_id,
        store_id=store_id,
        role_id="role-1",
        role_code="Cashier",
        email="cashier@cycle.test",
        permissions={
            "cycle_toys.view",
            "cycle_toys.manage",
            "cycle_toys.service_manage",
            "cycle_toys.assembly_manage",
        },
        is_platform_admin=False,
    )


def test_assembly_order_lifecycle_and_isolation(session: Session):
    auth1 = _auth("comp-a")
    auth2 = _auth("comp-b")

    created = create_assembly_order(
        session,
        auth1,
        {
            "customer_name": "Rahim",
            "customer_phone": "01711000001",
            "bicycle_model": 'Phoenix Dino 14"',
            "wheel_size": '14"',
            "technician": "Kabir",
            "assembly_fee": 350,
            "notes": "Add training wheels",
        },
    )
    session.commit()
    assert created["status"] == "Queue"
    assert created["order_no"].startswith("ASM-")
    assert created["assembly_fee"] == 350.0

    # Transition Queue -> In Progress -> PDI Completed -> Ready for Delivery
    in_prog = update_assembly_order(session, auth1, created["id"], {"status": "In Progress"})
    assert in_prog["status"] == "In Progress"

    pdi = update_assembly_order(session, auth1, created["id"], {"status": "PDI Completed"})
    assert pdi["status"] == "PDI Completed"
    assert pdi["pdi_passed"] is True

    ready = update_assembly_order(session, auth1, created["id"], {"status": "Ready for Delivery"})
    session.commit()
    assert ready["status"] == "Ready for Delivery"

    # Tenant isolation
    assert len(list_assembly_orders(session, "comp-a")) == 1
    assert len(list_assembly_orders(session, "comp-b")) == 0
    with pytest.raises(HTTPException) as exc:
        update_assembly_order(session, auth2, created["id"], {"status": "Queue"})
    assert exc.value.status_code == 404


def test_service_job_lifecycle_and_cost_calculation(session: Session):
    auth = _auth()
    job = create_service_job(
        session,
        auth,
        {
            "customer_name": "Mahmud",
            "customer_phone": "01922000001",
            "bike_model": 'Veloce Outrace 26"',
            "service_type": "Hydraulic Brake Bleed",
            "parts_replaced": "Brake Pads",
            "labor_fee": 400,
            "parts_cost": 350,
            "mechanic": "Kabir",
        },
    )
    session.commit()
    assert job["total_cost"] == 750.0
    assert job["status"] == "Intake"

    updated = update_service_job(session, auth, job["id"], {"status": "Completed", "parts_cost": 450})
    session.commit()
    assert updated["status"] == "Completed"
    assert updated["total_cost"] == 850.0
    assert len(list_service_jobs(session, auth.company_id, status="Completed")) == 1


def test_battery_warranty_and_inspections(session: Session):
    auth = _auth()
    log = create_battery_log(
        session,
        auth,
        {
            "vehicle_model": "Mercedes G63 12V Jeep",
            "customer_name": "Imran",
            "battery_serial": "BAT-12V-999",
            "voltage_rating": "12V",
            "measured_voltage": "12.7V",
            "remote_paired": True,
            "warranty_months": 12,
        },
    )
    session.commit()
    assert log["status"] == "Passed PDI"

    claimed = update_battery_log(session, auth, log["id"], {"status": "Warranty Service"})
    session.commit()
    assert claimed["status"] == "Warranty Service"
    assert len(list_battery_logs(session, auth.company_id, voltage_rating="12V")) == 1

    serial_rec = create_inspection_log(
        session,
        auth,
        {
            "log_type": "frame_serial",
            "item_model": 'Veloce Outrace 26"',
            "frame_serial": "VEL-26-88912",
            "frame_color": "Matte Black",
            "customer_contact": "01711111111",
        },
    )
    pdi_rec = create_inspection_log(
        session,
        auth,
        {
            "log_type": "pdi_5point",
            "item_model": 'Veloce Outrace 26"',
            "inspector": "Kabir",
            "passed": True,
            "details": {"handlebar": True, "brakes": True, "pedals": True, "tires": True, "drivetrain": True},
        },
    )
    session.commit()
    assert serial_rec["frame_serial"] == "VEL-26-88912"
    assert pdi_rec["passed"] is True
    assert len(list_inspection_logs(session, auth.company_id, frame_serial="VEL-26-88912")) == 1
