"""Damaged stock holding bucket + two-phase (dispatch/receive) in-transit transfers."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_inventory_core import _product, _store_id, _total_on_hand


def _bucket_row(client: TestClient, headers: dict, product_id: str, store_id: str) -> dict:
    res = client.get("/api/v1/inventory/stock", headers=headers, params={"store_id": store_id})
    assert res.status_code == 200
    row = next((r for r in res.json() if r["product_id"] == product_id), None)
    # A store+product combo with no StockBalance row yet (never stocked/moved
    # there before) simply doesn't appear in the list — treat as all-zero,
    # matching how _total_on_hand's sum() already handles the same case.
    if row is None:
        return {"product_id": product_id, "qty_on_hand": 0.0, "qty_reserved": 0.0, "qty_available": 0.0, "qty_damaged": 0.0, "qty_in_transit": 0.0}
    return row


def test_stock_list_includes_damage_and_in_transit_fields(auth_headers, client: TestClient):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    row = _bucket_row(client, auth_headers, product["id"], store_id)
    assert "qty_damaged" in row
    assert "qty_in_transit" in row


def test_mark_damaged_moves_qty_out_of_sellable(auth_headers, client: TestClient):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    on_hand_before = _total_on_hand(client, auth_headers, product["id"], store_id)
    damaged_before = _bucket_row(client, auth_headers, product["id"], store_id)["qty_damaged"]

    res = client.post(
        "/api/v1/inventory/damage",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 2, "reason": "Dropped during restock"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["qty_damaged"] == damaged_before + 2

    on_hand_after = _total_on_hand(client, auth_headers, product["id"], store_id)
    assert on_hand_after == on_hand_before - 2

    row = _bucket_row(client, auth_headers, product["id"], store_id)
    assert row["qty_damaged"] == damaged_before + 2


def test_mark_damaged_rejects_more_than_on_hand(auth_headers, client: TestClient):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    on_hand = _total_on_hand(client, auth_headers, product["id"], store_id)

    res = client.post(
        "/api/v1/inventory/damage",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": on_hand + 1000, "reason": "test"},
    )
    assert res.status_code == 409


def test_restore_damaged_stock_returns_to_sellable(auth_headers, client: TestClient):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    on_hand_before = _total_on_hand(client, auth_headers, product["id"], store_id)

    client.post(
        "/api/v1/inventory/damage",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 3, "reason": "Inspect before restock"},
    )
    damaged = _bucket_row(client, auth_headers, product["id"], store_id)["qty_damaged"]

    restore = client.post(
        "/api/v1/inventory/damage/restore",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 3},
    )
    assert restore.status_code == 200, restore.text
    assert restore.json()["qty_damaged"] == damaged - 3

    on_hand_after = _total_on_hand(client, auth_headers, product["id"], store_id)
    assert on_hand_after == on_hand_before  # fully round-tripped: damaged then restored


def test_restore_more_than_damaged_rejected(auth_headers, client: TestClient):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    res = client.post(
        "/api/v1/inventory/damage/restore",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 999999},
    )
    assert res.status_code == 400


def test_writeoff_damaged_stock_does_not_touch_on_hand_again(auth_headers, client: TestClient):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    on_hand_before = _total_on_hand(client, auth_headers, product["id"], store_id)

    client.post(
        "/api/v1/inventory/damage",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 1, "reason": "Crushed box"},
    )
    on_hand_after_damage = _total_on_hand(client, auth_headers, product["id"], store_id)
    assert on_hand_after_damage == on_hand_before - 1

    writeoff = client.post(
        "/api/v1/inventory/damage/writeoff",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 1, "reason": "Unsellable — discarded"},
    )
    assert writeoff.status_code == 200, writeoff.text
    assert writeoff.json()["qty_damaged"] == 0

    # write-off must not double-deduct on_hand (it was already removed when marked damaged)
    on_hand_final = _total_on_hand(client, auth_headers, product["id"], store_id)
    assert on_hand_final == on_hand_after_damage


def test_dispatch_and_receive_transfer_two_phase(auth_headers, client: TestClient):
    stores = client.get("/api/v1/org/stores", headers=auth_headers)
    store_ids = [s["id"] for s in stores.json()]
    assert len(store_ids) >= 2
    from_store, to_store = store_ids[0], store_ids[1]

    product = _product(client, auth_headers)
    before_from = _total_on_hand(client, auth_headers, product["id"], from_store)
    before_to = _total_on_hand(client, auth_headers, product["id"], to_store)
    to_in_transit_before = _bucket_row(client, auth_headers, product["id"], to_store)["qty_in_transit"]

    dispatch = client.post(
        "/api/v1/inventory/transfer/dispatch",
        headers=auth_headers,
        json={
            "product_id": product["id"], "from_store_id": from_store, "to_store_id": to_store,
            "qty": 2, "reason": "In-transit test",
        },
    )
    assert dispatch.status_code == 200, dispatch.text
    assert dispatch.json()["status"] == "in_transit"
    transfer_id = dispatch.json()["id"]

    # Source already decremented; destination not yet sellable, but in_transit bucket shows it incoming.
    after_dispatch_from = _total_on_hand(client, auth_headers, product["id"], from_store)
    after_dispatch_to = _total_on_hand(client, auth_headers, product["id"], to_store)
    assert after_dispatch_from == before_from - 2
    assert after_dispatch_to == before_to  # not yet sellable at destination

    to_row = _bucket_row(client, auth_headers, product["id"], to_store)
    assert to_row["qty_in_transit"] == to_in_transit_before + 2

    pending = client.get("/api/v1/inventory/transfer/pending", headers=auth_headers, params={"store_id": to_store})
    assert pending.status_code == 200
    assert any(t["id"] == transfer_id for t in pending.json())

    receive = client.post(f"/api/v1/inventory/transfer/{transfer_id}/receive", headers=auth_headers)
    assert receive.status_code == 200, receive.text
    assert receive.json()["status"] == "completed"

    after_receive_to = _total_on_hand(client, auth_headers, product["id"], to_store)
    assert after_receive_to == before_to + 2
    to_row_final = _bucket_row(client, auth_headers, product["id"], to_store)
    assert to_row_final["qty_in_transit"] == to_in_transit_before

    pending_after = client.get("/api/v1/inventory/transfer/pending", headers=auth_headers, params={"store_id": to_store})
    assert all(t["id"] != transfer_id for t in pending_after.json())


def test_receive_already_completed_transfer_rejected(auth_headers, client: TestClient):
    stores = client.get("/api/v1/org/stores", headers=auth_headers)
    store_ids = [s["id"] for s in stores.json()]
    from_store, to_store = store_ids[0], store_ids[1]
    product = _product(client, auth_headers)

    dispatch = client.post(
        "/api/v1/inventory/transfer/dispatch",
        headers=auth_headers,
        json={"product_id": product["id"], "from_store_id": from_store, "to_store_id": to_store, "qty": 1, "reason": "double-receive test"},
    )
    transfer_id = dispatch.json()["id"]
    client.post(f"/api/v1/inventory/transfer/{transfer_id}/receive", headers=auth_headers)

    again = client.post(f"/api/v1/inventory/transfer/{transfer_id}/receive", headers=auth_headers)
    assert again.status_code == 409
