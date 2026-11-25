from fastapi.testclient import TestClient


def test_time_pricing_rules_crud(client: TestClient, auth_headers):

    headers = auth_headers


    # 1. Create a rule
    create_payload = {
        "name": "Evening Pastry 50% Off Clearance",
        "discount_type": "half_price",
        "discount_value": 50.0,
        "start_time": "20:00",
        "end_time": "23:59",
        "days_of_week": [0, 1, 2, 3, 4, 5, 6],
        "category_ids": ["Pastry", "Cakes"],
        "product_ids": [],
        "industry_pack": "all",
        "badge_label": "⚡ 50% Fresh Clearance",
        "description": "Half price on fresh pastries after 8pm",
        "is_active": True,
    }

    res = client.post("/api/v1/pricing/rules", json=create_payload, headers=headers)
    assert res.status_code == 200, res.text
    rule = res.json()
    assert rule["name"] == "Evening Pastry 50% Off Clearance"
    assert rule["discount_type"] == "half_price"
    assert rule["discount_value"] == 50.0
    assert rule["start_time"] == "20:00"
    assert "Pastry" in rule["category_ids"]
    rule_id = rule["id"]

    # 2. List rules
    res = client.get("/api/v1/pricing/rules", headers=headers)
    assert res.status_code == 200
    rules = res.json()
    assert any(r["id"] == rule_id for r in rules)

    # 3. Update rule
    update_payload = {
        "discount_value": 60.0,
        "badge_label": "⚡ 60% Fresh Clearance",
    }
    res = client.put(f"/api/v1/pricing/rules/{rule_id}", json=update_payload, headers=headers)
    assert res.status_code == 200
    updated = res.json()
    assert updated["discount_value"] == 60.0
    assert updated["badge_label"] == "⚡ 60% Fresh Clearance"

    # 4. Delete rule
    res = client.delete(f"/api/v1/pricing/rules/{rule_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["ok"] is True
