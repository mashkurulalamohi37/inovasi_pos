import { test, expect } from "@playwright/test";
import { API_URL, apiLogin, uiLogin, COMPANY_CODE, E2E_EMAIL, E2E_PASSWORD } from "./fixtures";

test.describe("@smoke auth", () => {
  test("API login success @smoke", async ({ request }) => {
    const tokens = await apiLogin(request);
    const me = await request.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(me.ok()).toBeTruthy();
    const body = await me.json();
    expect(body.email || body.user?.email || E2E_EMAIL).toBeTruthy();
  });

  test("API invalid login @smoke", async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: E2E_EMAIL,
        password: "wrong-password-xxx",
        company_code: COMPANY_CODE,
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("UI login reaches app @smoke", async ({ page }) => {
    test.skip(process.env.E2E_UI !== "1" && !process.env.CI_E2E_UI, "Set E2E_UI=1 with frontend + API");
    await uiLogin(page);
    await expect(page).toHaveURL(/\/app\//);
  });

  test("unauthenticated API is rejected @smoke", async ({ request }) => {
    const res = await request.get(`${API_URL}/products`);
    expect([401, 403]).toContain(res.status());
  });
});
