"""Phase 6B-6 — Optical Shop vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.core import Company
from app.models.industry import OpticalOrder, OpticalPrescription
from app.models.inventory import StockBalance
from tests.test_operations import _store_id, get_product_by_sku, login


def _customer(client, headers):
    res = client.post(
        "/api/v1/customers",
        headers=headers,
        json={"code": "OPT-C1", "name": "Optical Customer", "phone": "01820000001"},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_frame_and_lens_list(auth_headers, client: TestClient):
    frames = client.get("/api/v1/industry/optical/frames", headers=auth_headers)
    assert frames.status_code == 200
    assert any(f.get("sku") == "OP-001" for f in frames.json())
    lenses = client.get("/api/v1/industry/optical/lenses", headers=auth_headers)
    assert lenses.status_code == 200
    assert any(l.get("sku") == "OP-002" for l in lenses.json())


def test_frame_profile_upsert_and_permission(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "OP-001")
    ok = client.post(
        "/api/v1/industry/optical/frames",
        headers=auth_headers,
        json={"product_id": product["id"], "frame_shape": "aviator", "color": "Gold"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["frame_shape"] == "aviator"
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/optical/frames",
        headers=cashier,
        json={"product_id": product["id"], "frame_shape": "round"},
    )
    assert denied.status_code == 403


def test_prescription_create_history_and_axis_validation(auth_headers, client: TestClient, session: Session):
    cust = _customer(client, auth_headers)
    bad = client.post(
        "/api/v1/industry/optical/prescriptions",
        headers=auth_headers,
        json={
            "customer_id": cust["id"],
            "od": {"sphere": -2.0, "cylinder": -0.5, "axis": 200},
            "os": {"sphere": -1.75, "axis": 90},
        },
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/v1/industry/optical/prescriptions",
        headers=auth_headers,
        json={
            "customer_id": cust["id"],
            "doctor_name": "Dr. Rahman",
            "od": {"sphere": -2.0, "cylinder": -0.5, "axis": 180, "pd": 32},
            "os": {"sphere": -1.75, "cylinder": -0.25, "axis": 90, "pd": 32},
            "total_pd": 64,
        },
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["od"]["sphere"] == -2.0
    assert body["os"]["axis"] == 90
    hist = client.get(
        "/api/v1/industry/optical/prescriptions",
        headers=auth_headers,
        params={"customer_id": cust["id"]},
    )
    assert hist.status_code == 200
    assert any(r["id"] == body["id"] for r in hist.json())
    row = session.get(OpticalPrescription, body["id"])
    assert row is not None
    assert row.customer_id == cust["id"]


def test_optical_order_confirm_lab_finalize_stock(auth_headers, client: TestClient, session: Session):
    cust = _customer(client, auth_headers)
    rx = client.post(
        "/api/v1/industry/optical/prescriptions",
        headers=auth_headers,
        json={
            "customer_id": cust["id"],
            "od": {"sphere": -1.0, "axis": 10},
            "os": {"sphere": -1.0, "axis": 170},
        },
    ).json()
    frame = get_product_by_sku(client, auth_headers, "OP-001")
    lens = get_product_by_sku(client, auth_headers, "OP-002")
    store_id = _store_id(client, auth_headers)

    bal_before = session.exec(
        select(StockBalance).where(StockBalance.product_id == frame["id"])
    ).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0

    order = client.post(
        "/api/v1/industry/optical/orders",
        headers=auth_headers,
        json={
            "customer_id": cust["id"],
            "prescription_id": rx["id"],
            "store_id": store_id,
            "lines": [
                {"line_type": "frame", "product_id": frame["id"], "qty": 1, "unit_price": 1200},
                {
                    "line_type": "lens_pair",
                    "product_id": lens["id"],
                    "qty": 1,
                    "unit_price": 800,
                    "configuration": {"coating": "blue-cut", "index": "1.56"},
                },
            ],
        },
    )
    assert order.status_code == 200, order.text
    order_id = order.json()["id"]
    assert order.json()["status"] == "draft"
    assert order.json()["gross_amount"] == 2000

    conf = client.post(
        f"/api/v1/industry/optical/orders/{order_id}/confirm",
        headers=auth_headers,
        json={},
    )
    assert conf.status_code == 200
    assert conf.json()["status"] == "confirmed"
    assert conf.json()["net_amount"] > 0

    # invalid jump
    bad = client.patch(
        f"/api/v1/industry/optical/orders/{order_id}/status",
        headers=auth_headers,
        json={"status": "delivered"},
    )
    assert bad.status_code == 400

    for status in ["sent_to_lab", "lens_processing", "lens_ready", "fitting", "qc", "ready"]:
        res = client.patch(
            f"/api/v1/industry/optical/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": status, "lab_reference_no": "LAB-1"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["status"] == status

    adv = client.post(
        f"/api/v1/industry/optical/orders/{order_id}/advance",
        headers=auth_headers,
        json={"amount": 500, "method": "cash"},
    )
    assert adv.status_code == 200
    assert adv.json()["advance_amount"] == 500

    fin = client.post(
        f"/api/v1/industry/optical/orders/{order_id}/finalize",
        headers=auth_headers,
        json={"tender": "cash"},
    )
    assert fin.status_code == 200, fin.text
    assert fin.json()["order"]["sales_invoice_id"]
    assert fin.json()["order"]["status"] == "paid"

    # duplicate finalize blocked
    again = client.post(
        f"/api/v1/industry/optical/orders/{order_id}/finalize",
        headers=auth_headers,
        json={"tender": "cash"},
    )
    assert again.status_code in {400, 409}

    session.refresh(bal_before) if bal_before else None
    bal_after = session.exec(
        select(StockBalance).where(StockBalance.product_id == frame["id"])
    ).first()
    assert bal_after is not None
    assert float(bal_after.qty_on_hand) == qty_before - 1

    delivered = client.patch(
        f"/api/v1/industry/optical/orders/{order_id}/status",
        headers=auth_headers,
        json={"status": "delivered"},
    )
    assert delivered.status_code == 200
    assert delivered.json()["status"] == "delivered"

    audits = session.exec(select(AuditLog).where(AuditLog.entity_type == "optical_order")).all()
    assert len(audits) >= 3


def test_unpaid_delivery_blocked(auth_headers, client: TestClient):
    cust = _customer(client, auth_headers)
    frame = get_product_by_sku(client, auth_headers, "OP-001")
    order = client.post(
        "/api/v1/industry/optical/orders",
        headers=auth_headers,
        json={
            "customer_id": cust["id"],
            "store_id": _store_id(client, auth_headers),
            "lines": [{"line_type": "frame", "product_id": frame["id"], "qty": 1, "unit_price": 100}],
        },
    ).json()
    client.post(f"/api/v1/industry/optical/orders/{order['id']}/confirm", headers=auth_headers, json={})
    for status in ["sent_to_lab", "lens_processing", "lens_ready", "fitting", "qc", "ready"]:
        client.patch(
            f"/api/v1/industry/optical/orders/{order['id']}/status",
            headers=auth_headers,
            json={"status": status},
        )
    blocked = client.patch(
        f"/api/v1/industry/optical/orders/{order['id']}/status",
        headers=auth_headers,
        json={"status": "delivered"},
    )
    assert blocked.status_code == 400


def test_optical_tenant_isolation(auth_headers, client: TestClient, session: Session):
    cust = _customer(client, auth_headers)
    rx = client.post(
        "/api/v1/industry/optical/prescriptions",
        headers=auth_headers,
        json={"customer_id": cust["id"], "od": {"sphere": -1}, "os": {"sphere": -1}},
    ).json()
    other = session.exec(select(Company).where(Company.code == "PULSE-PLATFORM")).first()
    if not other:
        return
    plat = login(client, "super@pulse.pos", "super123", "PULSE-PLATFORM")
    listed = client.get("/api/v1/industry/optical/prescriptions", headers=plat)
    assert listed.status_code == 200
    assert not any(r["id"] == rx["id"] for r in listed.json())
    get = client.get(f"/api/v1/industry/optical/prescriptions/{rx['id']}", headers=plat)
    assert get.status_code == 404


def test_cashier_cannot_manage_lab_without_perm(client: TestClient, auth_headers):
    cust = client.post(
        "/api/v1/customers",
        headers=auth_headers,
        json={"code": "OPT-C2", "name": "C2", "phone": "01820000002"},
    ).json()
    frame = get_product_by_sku(client, auth_headers, "OP-001")
    order = client.post(
        "/api/v1/industry/optical/orders",
        headers=auth_headers,
        json={
            "customer_id": cust["id"],
            "store_id": _store_id(client, auth_headers),
            "lines": [{"line_type": "frame", "product_id": frame["id"], "qty": 1}],
        },
    ).json()
    client.post(f"/api/v1/industry/optical/orders/{order['id']}/confirm", headers=auth_headers, json={})
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.patch(
        f"/api/v1/industry/optical/orders/{order['id']}/status",
        headers=cashier,
        json={"status": "sent_to_lab"},
    )
    assert denied.status_code == 403
