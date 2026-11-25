from fastapi.testclient import TestClient
from tests.conftest import login_payload


def test_pack_activation_request_and_approval_workflow(client: TestClient, auth_headers: dict):
    # 1. Login super admin
    res_super = client.post("/api/v1/auth/login", json=login_payload("super@pulse.pos", "super123"))
    assert res_super.status_code == 200
    super_headers = {"Authorization": f"Bearer {res_super.json()['access_token']}"}

    # 2. As tenant (auth_headers), ensure beef_shop is initially inactive
    res_packs = client.get("/api/v1/configuration/industry-packs", headers=auth_headers)
    assert res_packs.status_code == 200
    packs = {p["industry_code"]: p for p in res_packs.json()}
    
    # If beef_shop doesn't exist yet or is disabled, tenant attempting direct activation without super admin fails
    res_direct = client.patch(
        "/api/v1/configuration/industry-packs/beef_shop",
        json={"enabled_company": True},
        headers=auth_headers,
    )
    # If pack exists and was inactive, it raises 403. If pack doesn't exist yet in DB, 404
    assert res_direct.status_code in (403, 404)

    # 3. Tenant submits activation request for beef_shop
    res_req = client.post(
        "/api/v1/configuration/industry-packs/beef_shop/request-activation",
        json={"note": "We are expanding our meat counter"},
        headers=auth_headers,
    )
    assert res_req.status_code == 200
    req_data = res_req.json()
    assert req_data["industry_code"] == "beef_shop"
    assert req_data["status"] == "pending"
    assert req_data["note"] == "We are expanding our meat counter"
    req_id = req_data["id"]

    # 4. Duplicate pending request is rejected with 409
    res_dup = client.post(
        "/api/v1/configuration/industry-packs/beef_shop/request-activation",
        json={"note": "Another request"},
        headers=auth_headers,
    )
    assert res_dup.status_code == 409

    # 5. Tenant lists their requests
    res_tenant_reqs = client.get("/api/v1/configuration/industry-packs/requests", headers=auth_headers)
    assert res_tenant_reqs.status_code == 200
    tenant_reqs = res_tenant_reqs.json()
    assert any(r["id"] == req_id and r["status"] == "pending" for r in tenant_reqs)

    # 6. Super Admin lists pack activation requests
    res_super_list = client.get("/api/v1/super-admin/pack-requests", headers=super_headers)
    assert res_super_list.status_code == 200
    super_reqs = res_super_list.json()
    assert any(r["id"] == req_id for r in super_reqs)

    # 7. Super Admin approves request
    res_approve = client.post(
        f"/api/v1/super-admin/pack-requests/{req_id}/resolve",
        json={"action": "approve", "comment": "Approved for meat counter branch"},
        headers=super_headers,
    )
    assert res_approve.status_code == 200
    approved_data = res_approve.json()
    assert approved_data["status"] == "approved"
    assert approved_data["comment"] == "Approved for meat counter branch"

    # 8. Verify the pack is now enabled across scopes for the tenant
    res_packs_after = client.get("/api/v1/configuration/industry-packs", headers=auth_headers)
    assert res_packs_after.status_code == 200
    packs_after = {p["industry_code"]: p for p in res_packs_after.json()}
    assert "beef_shop" in packs_after
    assert packs_after["beef_shop"]["enabled_company"] is True
    assert packs_after["beef_shop"]["enabled_store"] is True
    assert packs_after["beef_shop"]["enabled_counter"] is True

    # 9. Test rejection workflow on another inactive pack
    inactive_code = "bakery"
    res_reject_req = client.post(
        f"/api/v1/configuration/industry-packs/{inactive_code}/request-activation",
        json={"note": "Requesting bakery pack"},
        headers=auth_headers,
    )
    assert res_reject_req.status_code == 200
    reject_req_id = res_reject_req.json()["id"]

    res_reject = client.post(
        f"/api/v1/super-admin/pack-requests/{reject_req_id}/resolve",
        json={"action": "reject", "comment": "Requires Enterprise plan upgrade"},
        headers=super_headers,
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["status"] == "rejected"
