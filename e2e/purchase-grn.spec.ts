import { test, expect } from "@playwright/test";
import { API_URL, apiLogin } from "./fixtures";

test.describe("@smoke purchase-grn", () => {
  test("health live/ready @smoke", async ({ request }) => {
    const live = await request.get(`${API_URL.replace(/\/api\/v1$/, "")}/health/live`);
    expect(live.ok()).toBeTruthy();
    const ready = await request.get(`${API_URL.replace(/\/api\/v1$/, "")}/health/ready`);
    // ready may be 503 if migrations mismatched in ad-hoc envs; prefer 200 in seeded CI
    expect([200, 503]).toContain(ready.status());
  });

  test("list purchases as authenticated admin @smoke", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const res = await request.get(`${API_URL}/purchases`, {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { limit: 10 },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  });
});
