"""Phase 5 integrations platform tests."""

import json
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.integrations import IntegrationConnector, IntegrationOutbox

from test_operations import _grocery_sale


def test_list_registry(auth_headers, client: TestClient):
    res = client.get("/api/v1/integrations/registry", headers=auth_headers)
    assert res.status_code == 200
    codes = {r["code"] for r in res.json()}
    assert "webhook" in codes
    assert "generic_oauth" in codes


def test_create_webhook_connector(auth_headers, client: TestClient, session: Session):
    res = client.post(
        "/api/v1/integrations/connectors",
        headers=auth_headers,
        json={
            "connector_code": "webhook",
            "name": "Test webhook",
            "config": {"url": "https://example.com/hook", "events": ["sale.completed"]},
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["connector_code"] == "webhook"
    row = session.get(IntegrationConnector, data["id"])
    assert row is not None


def test_sale_enqueues_outbox(auth_headers, client: TestClient, session: Session):
    client.post(
        "/api/v1/integrations/connectors",
        headers=auth_headers,
        json={
            "connector_code": "webhook",
            "name": "Sale hook",
            "config": {"url": "https://example.com/hook", "events": ["sale.completed"]},
        },
    )
    _grocery_sale(client, auth_headers, "p5-sale-outbox-001", qty=1)
    rows = session.exec(select(IntegrationOutbox).where(IntegrationOutbox.event_type == "sale.completed")).all()
    assert len(rows) >= 1
    payload = json.loads(rows[0].payload_json)
    assert payload["invoice_number"]


@patch("app.services.integration_service.deliver_webhook", return_value=(True, None))
def test_process_outbox_delivers(mock_deliver, auth_headers, client: TestClient, session: Session):
    create = client.post(
        "/api/v1/integrations/connectors",
        headers=auth_headers,
        json={
            "connector_code": "webhook",
            "name": "Deliver hook",
            "config": {"url": "https://example.com/hook", "events": ["sale.completed"]},
        },
    )
    connector_id = create.json()["id"]
    conn = session.get(IntegrationConnector, connector_id)
    session.add(
        IntegrationOutbox(
            company_id=conn.company_id,
            connector_id=connector_id,
            event_type="sale.completed",
            payload_json=json.dumps({"invoice_id": "x"}),
            status="pending",
        )
    )
    session.flush()
    res = client.post("/api/v1/integrations/outbox/process", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["processed"] >= 1
    mock_deliver.assert_called()


def test_receive_inbox(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/integrations/inbox",
        headers=auth_headers,
        json={"event_type": "stock.sync", "payload": {"sku": "GROC-001", "qty": 10}},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "pending"

    listed = client.get("/api/v1/integrations/inbox", headers=auth_headers)
    assert listed.status_code == 200
    assert any(r["event_type"] == "stock.sync" for r in listed.json())
