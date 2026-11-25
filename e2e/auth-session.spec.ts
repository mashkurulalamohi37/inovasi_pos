import { test, expect } from "@playwright/test";
import { API_URL, apiLogin } from "./fixtures";

/** Auth refresh / session edges against real API (not MSW). */
test.describe("auth-session", () => {
  test("refresh with valid refresh_token @smoke", async ({ request }) => {
    const login = await apiLogin(request);
    test.skip(!login.refresh_token, "API did not return refresh_token");
    const res = await request.post(`${API_URL}/auth/refresh`, {
      data: { refresh_token: login.refresh_token },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
  });

  test("invalid refresh rejected @smoke", async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/refresh`, {
      data: { refresh_token: "not-a-real-refresh-token" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("logout endpoint when present", async ({ request }) => {
    const { access_token, refresh_token } = await apiLogin(request);
    const res = await request.post(`${API_URL}/auth/logout`, {
      headers: { Authorization: `Bearer ${access_token}` },
      data: refresh_token ? { refresh_token } : {},
    });
    // 200/204 preferred; 404 if logout not implemented — do not fake
    expect([200, 204, 404, 405]).toContain(res.status());
  });
});
