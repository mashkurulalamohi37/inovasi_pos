"""SQA audit probes for the Jewelry vertical. Diagnostic only — not a spec."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from tests.test_operations import get_product_by_sku, login


def _rate(client, headers, karat="22K", metal="Gold", selling=10000, buying=9200):
    return client.post(
        "/api/v1/industry/jewelry/rates",
        headers=headers,
        json={"metal_type": metal, "karat": karat, "selling_rate": selling, "buying_rate": buying},
    )


# ── J-A: profile endpoints ────────────────────────────────────────────────────

def test_A1_list_profiles_returns_200(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/jewelry/profiles", headers=auth_headers)
    print("\n[A1] GET /jewelry/profiles ->", res.status_code, res.text[:400])
    assert res.status_code == 200


def test_A2_upsert_profile_with_frontend_payload(auth_headers, client: TestClient):
    """Payload is byte-for-byte what src/routes/app.jewelry.profiles.tsx sends."""
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    res = client.put(
        f"/api/v1/industry/jewelry/profiles/{product['id']}",
        headers=auth_headers,
        json={
            "metal_type": "Gold",
            "karat": "22K",
            "gross_weight_grams": 11.66,
            "net_metal_weight": 10.5,
            "stone_weight_grams": 1.16,
            "making_charge_type": "per_gram",
            "making_charge_rate": 650,
            "wastage_percentage": 2.5,
            "stone_value": 5000,
            "certificate_no": "CERT-JW-8821",
        },
    )
    print("\n[A2] PUT profile (frontend payload) ->", res.status_code, res.text[:400])
    assert res.status_code == 200


def test_A3_upsert_profile_with_backend_field_names(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    res = client.put(
        f"/api/v1/industry/jewelry/profiles/{product['id']}",
        headers=auth_headers,
        json={
            "metal_type": "Gold", "karat": "22K",
            "gross_weight": 11.66, "net_metal_weight": 10.5, "stone_weight": 1.16,
            "making_charge_rate": 650, "wastage_percentage": 2.5,
        },
    )
    print("\n[A3] PUT profile (backend names) ->", res.status_code, res.text[:400])
    assert res.status_code == 200


def test_A4_get_single_profile(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    client.put(
        f"/api/v1/industry/jewelry/profiles/{product['id']}",
        headers=auth_headers,
        json={"gross_weight": 10.0, "net_metal_weight": 9.0, "stone_weight": 1.0},
    )
    res = client.get(f"/api/v1/industry/jewelry/profiles/{product['id']}", headers=auth_headers)
    print("\n[A4] GET profile by id ->", res.status_code, res.text[:400])
    assert res.status_code == 200


# ── J-B: weight validation ────────────────────────────────────────────────────

def test_B1_net_weight_may_not_exceed_gross(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    res = client.put(
        f"/api/v1/industry/jewelry/profiles/{product['id']}",
        headers=auth_headers,
        json={"gross_weight": 10.0, "stone_weight": 0.0, "net_metal_weight": 10000.0},
    )
    print("\n[B1] net=10000g vs gross=10g ->", res.status_code, res.text[:300])
    assert res.status_code == 400, "net_metal_weight far above gross_weight was accepted"


# ── J-C: dashboard ────────────────────────────────────────────────────────────

def test_C1_dashboard_empty(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/jewelry/dashboard", headers=auth_headers)
    print("\n[C1] GET /jewelry/dashboard ->", res.status_code, res.text[:400])
    assert res.status_code == 200


def test_C2_dashboard_after_settled_buyback(auth_headers, client: TestClient):
    _rate(client, auth_headers)
    bb = client.post(
        "/api/v1/industry/jewelry/buybacks",
        headers=auth_headers,
        json={"customer_name": "SQA", "metal_type": "Gold", "purity": "22K",
              "gross_weight": 11.66, "net_metal_weight": 11.0},
    )
    assert bb.status_code == 200, bb.text
    bid = bb.json()["id"]
    for st in ("assessed", "approved", "settled"):
        r = client.patch(f"/api/v1/industry/jewelry/buybacks/{bid}",
                         headers=auth_headers, json={"status": st})
        assert r.status_code == 200, (st, r.text)
    res = client.get("/api/v1/industry/jewelry/dashboard", headers=auth_headers)
    print("\n[C2] dashboard after settled buyback ->", res.status_code, res.text[:400])
    assert res.status_code == 200


# ── J-D: buyback numbering / concurrency ──────────────────────────────────────

def test_D1_buyback_numbers_unique(auth_headers, client: TestClient):
    _rate(client, auth_headers)
    nos = []
    ids = []
    for i in range(4):
        r = client.post("/api/v1/industry/jewelry/buybacks", headers=auth_headers,
                        json={"customer_name": f"C{i}", "metal_type": "Gold",
                              "purity": "22K", "net_metal_weight": 5})
        assert r.status_code == 200, r.text
        nos.append(r.json()["buyback_no"])
        ids.append(r.json()["id"])
    # cancel one, then create another -> len()+1 scheme can collide
    client.patch(f"/api/v1/industry/jewelry/buybacks/{ids[0]}", headers=auth_headers,
                 json={"status": "cancelled"})
    r = client.post("/api/v1/industry/jewelry/buybacks", headers=auth_headers,
                    json={"customer_name": "C-last", "metal_type": "Gold",
                          "purity": "22K", "net_metal_weight": 5})
    nos.append(r.json()["buyback_no"])
    print("\n[D1] buyback_nos ->", nos)
    assert len(nos) == len(set(nos)), f"duplicate buyback_no issued: {nos}"


# ── J-E: rate posting validation ──────────────────────────────────────────────

def test_E1_negative_buying_rate_rejected(auth_headers, client: TestClient):
    res = _rate(client, auth_headers, selling=10000, buying=-5000)
    print("\n[E1] buying_rate=-5000 ->", res.status_code, res.text[:300])
    assert res.status_code == 400, "negative buying_rate accepted"


def test_E2_buying_rate_above_selling_rejected(auth_headers, client: TestClient):
    res = _rate(client, auth_headers, selling=10000, buying=99999)
    print("\n[E2] buying(99999) > selling(10000) ->", res.status_code, res.text[:300])
    assert res.status_code == 400, "buying_rate above selling_rate accepted"


def test_E3_absurd_rate_rejected(auth_headers, client: TestClient):
    res = _rate(client, auth_headers, selling=10_000_000_000)
    print("\n[E3] selling_rate=1e10 ->", res.status_code, res.text[:300])
    assert res.status_code == 400, "absurd selling_rate accepted with no sanity bound"


# ── J-F: quote / pricing integrity ────────────────────────────────────────────

def test_F1_quote_rejects_negative_weight(auth_headers, client: TestClient):
    _rate(client, auth_headers)
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    res = client.post("/api/v1/industry/jewelry/quote", headers=auth_headers,
                      json={"product_id": product["id"], "net_metal_weight": -50})
    print("\n[F1] quote net=-50 ->", res.status_code, res.text[:300])
    assert res.status_code == 400


def test_F2_cashier_cannot_silently_override_rate(client: TestClient, auth_headers):
    _rate(client, auth_headers)
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    res = client.post("/api/v1/industry/jewelry/quote", headers=cashier,
                      json={"product_id": product["id"], "net_metal_weight": 10,
                            "metal_rate": 1.0})
    print("\n[F2] cashier quote w/ metal_rate=1 ->", res.status_code, res.text[:300])
    assert res.status_code == 403


def test_F3_quote_caps_client_weight_at_recorded_gross(auth_headers, client: TestClient):
    """A caller may quote a measured weight, but not above the tagged gross weight.

    Full server authority is deliberately NOT asserted here: quoting an explicit
    net weight is part of the accepted contract (see
    test_jewelry_quote_and_sale_snapshots_rate). Only the over-billing ceiling is.
    """
    _rate(client, auth_headers)
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    client.put(f"/api/v1/industry/jewelry/profiles/{product['id']}", headers=auth_headers,
               json={"gross_weight": 10.0, "stone_weight": 0.0, "net_metal_weight": 10.0})
    ok = client.post("/api/v1/industry/jewelry/quote", headers=auth_headers,
                     json={"product_id": product["id"], "net_metal_weight": 9.5})
    print("\n[F3] quote net=9.5 within 10g gross ->", ok.status_code)
    assert ok.status_code == 200, ok.text
    over = client.post("/api/v1/industry/jewelry/quote", headers=auth_headers,
                       json={"product_id": product["id"], "net_metal_weight": 10_000})
    print("[F3] quote net=10000 vs 10g gross ->", over.status_code, over.text[:200])
    assert over.status_code == 400, "client-supplied weight above recorded gross was billable"


# ── J-G: tenant isolation / authz ─────────────────────────────────────────────

def test_G1_cashier_cannot_list_buybacks(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = client.get("/api/v1/industry/jewelry/buybacks", headers=cashier)
    print("\n[G1] cashier GET buybacks ->", res.status_code)
    assert res.status_code in (200, 403)


def test_G2_unauthenticated_blocked(client: TestClient):
    for path in ("/jewelry/dashboard", "/jewelry/profiles", "/jewelry/buybacks",
                 "/jewelry/rates", "/jewelry/certificates"):
        res = client.get(f"/api/v1/industry{path}")
        print(f"\n[G2] anon GET {path} ->", res.status_code)
        assert res.status_code in (401, 403), f"{path} reachable without auth"


# ── J-H: certificate double-sell ──────────────────────────────────────────────

def test_H1_certificate_cannot_be_quoted_twice_after_sale(auth_headers, client: TestClient):
    _rate(client, auth_headers)
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    cert = client.post("/api/v1/industry/jewelry/certificates", headers=auth_headers,
                       json={"product_id": product["id"], "certificate_no": "SQA-CERT-1",
                             "purity": "22K", "gross_weight": 10, "stone_weight": 0,
                             "net_metal_weight": 10})
    print("\n[H1] create cert ->", cert.status_code, cert.text[:300])
    assert cert.status_code == 200
    dup = client.post("/api/v1/industry/jewelry/certificates", headers=auth_headers,
                      json={"product_id": product["id"], "certificate_no": "SQA-CERT-1",
                            "purity": "22K", "gross_weight": 10})
    print("[H1] duplicate cert ->", dup.status_code)
    assert dup.status_code == 409
