"""Phase 6B-9 — Salon vertical wiring tests."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import SalonAppointment, SalonCommission, SalonVisit
from tests.test_operations import _store_id, login


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def test_salon_services_and_staff(auth_headers, client: TestClient):
    services = client.get("/api/v1/industry/salon/services", headers=auth_headers)
    assert services.status_code == 200
    assert any(s.get("service_code") == "HC-CLASSIC" for s in services.json())

    staff = client.get("/api/v1/industry/salon/staff", headers=auth_headers)
    assert staff.status_code == 200
    assert any(s.get("display_name") == "Rina" for s in staff.json())

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/salon/services",
        headers=cashier,
        json={"service_code": "X", "service_name": "X", "base_price": 1},
    )
    assert denied.status_code == 403


def test_service_upsert(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/industry/salon/services",
        headers=auth_headers,
        json={
            "service_code": "NAIL-01",
            "service_name": "Manicure",
            "category": "Nail",
            "default_duration_minutes": 40,
            "base_price": 500,
            "commission_rate": 18,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["service_name"] == "Manicure"


def test_appointment_conflict_and_booking(auth_headers, client: TestClient, session: Session):
    services = client.get("/api/v1/industry/salon/services", headers=auth_headers).json()
    staff = client.get("/api/v1/industry/salon/staff", headers=auth_headers).json()
    resources = client.get("/api/v1/industry/salon/resources", headers=auth_headers).json()
    svc = next(s for s in services if s["service_code"] == "HC-CLASSIC")
    stylist = next(s for s in staff if s["display_name"] == "Rina")
    chair = next(r for r in resources if r["resource_code"] == "CHAIR-01")
    start = datetime.now(timezone.utc).replace(hour=11, minute=0, second=0, microsecond=0) + timedelta(days=1)

    ok = client.post(
        "/api/v1/industry/salon/appointments",
        headers=auth_headers,
        json={
            "customer_name": "Nusrat",
            "phone": "01700001111",
            "start_time": _iso(start),
            "lines": [{
                "service_id": svc["id"],
                "staff_id": stylist["id"],
                "resource_id": chair["id"],
            }],
        },
    )
    assert ok.status_code == 200, ok.text
    appt_id = ok.json()["id"]

    conflict = client.post(
        "/api/v1/industry/salon/appointments",
        headers=auth_headers,
        json={
            "customer_name": "Other",
            "start_time": _iso(start + timedelta(minutes=10)),
            "lines": [{
                "service_id": svc["id"],
                "staff_id": stylist["id"],
                "resource_id": chair["id"],
            }],
        },
    )
    assert conflict.status_code in {400, 409}, conflict.text

    cancel = client.post(
        f"/api/v1/industry/salon/appointments/{appt_id}/status",
        headers=auth_headers,
        json={"status": "cancelled", "cancel_reason": "Customer request"},
    )
    assert cancel.status_code == 200, cancel.text
    audits = session.exec(select(AuditLog).where(AuditLog.entity_id == appt_id)).all()
    assert any("salon" in (a.action or "") for a in audits)


def test_walk_in_service_checkout_and_commission(auth_headers, client: TestClient, session: Session):
    services = client.get("/api/v1/industry/salon/services", headers=auth_headers).json()
    staff = client.get("/api/v1/industry/salon/staff", headers=auth_headers).json()
    svc = next(s for s in services if s["service_code"] == "HC-CLASSIC")
    stylist = next(s for s in staff if s["display_name"] == "Rina")

    walk = client.post(
        "/api/v1/industry/salon/visits/walk-in",
        headers=auth_headers,
        json={
            "customer_name": "Walk-in Guest",
            "store_id": _store_id(client, auth_headers),
            "lines": [{"service_id": svc["id"], "staff_id": stylist["id"]}],
        },
    )
    assert walk.status_code == 200, walk.text
    visit_id = walk.json()["id"]
    line_id = walk.json()["lines"][0]["id"]

    start = client.post(
        f"/api/v1/industry/salon/visits/{visit_id}/lines/{line_id}/start",
        headers=auth_headers,
    )
    assert start.status_code == 200, start.text
    complete = client.post(
        f"/api/v1/industry/salon/visits/{visit_id}/lines/{line_id}/complete",
        headers=auth_headers,
    )
    assert complete.status_code == 200, complete.text

    tip = client.post(
        f"/api/v1/industry/salon/visits/{visit_id}/tips",
        headers=auth_headers,
        json={"amount": 50, "staff_id": stylist["id"]},
    )
    assert tip.status_code == 200, tip.text

    pay = client.post(
        f"/api/v1/industry/salon/visits/{visit_id}/checkout",
        headers=auth_headers,
        json={"tender": "cash"},
    )
    assert pay.status_code == 200, pay.text
    assert pay.json()["visit"]["status"] == "paid"
    assert pay.json()["invoice"]["id"]

    # Idempotent second checkout
    again = client.post(
        f"/api/v1/industry/salon/visits/{visit_id}/checkout",
        headers=auth_headers,
        json={"tender": "cash"},
    )
    assert again.status_code == 200, again.text
    assert again.json()["invoice"].get("duplicate") is True or again.json()["invoice"]["id"] == pay.json()["invoice"]["id"]

    commissions = session.exec(
        select(SalonCommission).where(SalonCommission.visit_id == visit_id)
    ).all()
    assert len(commissions) >= 1
    assert commissions[0].commission_amount > 0


def test_appointment_check_in_creates_visit(auth_headers, client: TestClient):
    services = client.get("/api/v1/industry/salon/services", headers=auth_headers).json()
    staff = client.get("/api/v1/industry/salon/staff", headers=auth_headers).json()
    svc = next(s for s in services if s["service_code"] == "FC-BASIC")
    stylist = next(s for s in staff if s["display_name"] == "Rina")
    start = datetime.now(timezone.utc).replace(hour=14, minute=0, second=0, microsecond=0) + timedelta(days=2)
    appt = client.post(
        "/api/v1/industry/salon/appointments",
        headers=auth_headers,
        json={
            "customer_name": "Checkin Customer",
            "start_time": _iso(start),
            "lines": [{"service_id": svc["id"], "staff_id": stylist["id"]}],
        },
    )
    assert appt.status_code == 200, appt.text
    checkin = client.post(
        f"/api/v1/industry/salon/appointments/{appt.json()['id']}/check-in",
        headers=auth_headers,
    )
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["status"] in {"checked_in", "open", "in_service"}
    assert len(checkin.json().get("lines") or []) >= 1


def test_salon_tenant_isolation(auth_headers, client: TestClient, session: Session):
    other = SalonAppointment(
        company_id="other-company",
        appointment_no="X-1",
        customer_name="Other",
        appointment_date=datetime.now(timezone.utc),
        start_time=datetime.now(timezone.utc),
        status="booked",
    )
    session.add(other)
    session.commit()
    res = client.get(f"/api/v1/industry/salon/appointments/{other.id}", headers=auth_headers)
    assert res.status_code == 404
