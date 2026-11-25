import { test, expect } from "@playwright/test";
import { API_URL, apiLogin, uiLogin, COMPANY_CODE, E2E_EMAIL } from "./fixtures";

test.describe("@ui @smoke auth-ui", () => {
  test.beforeEach(() => {
    test.skip(process.env.E2E_UI !== "1" && !process.env.CI_E2E_UI, "Set E2E_UI=1 (or CI_E2E_UI) with frontend");
  });

  test("UI login success @smoke @ui", async ({ page }) => {
    await uiLogin(page);
    await expect(page).toHaveURL(/\/app\//);
  });

  test("UI invalid login stays on login @ui", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.goto("/login");
    const company = page.locator("#workspace-code");
    await expect(company).toBeVisible({ timeout: 20_000 });
    await company.click();
    await company.press("Control+A");
    await company.pressSequentially(COMPANY_CODE, { delay: 30 });
    await expect(company).toHaveValue(COMPANY_CODE);
    await page.getByRole("button", { name: /^Verify to continue$/i }).click({ force: true });
    await expect(page.locator('.auth-slide-form--signin input[type="email"]')).toBeVisible({
      timeout: 25_000,
    });
    await page.locator('.auth-slide-form--signin input[type="email"]').fill(E2E_EMAIL);
    await page.locator('.auth-slide-form--signin input[type="password"]').fill("wrong-password-xxx");
    await page.locator('.auth-slide-form--signin button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("reload preserves session @ui", async ({ page }) => {
    await uiLogin(page);
    await page.reload();
    await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });
  });

  test("logout clears session @ui", async ({ page }) => {
    await uiLogin(page);
    await page.evaluate(() => {
      localStorage.removeItem("pulse.accessToken");
      localStorage.removeItem("pulse.refreshToken");
      localStorage.removeItem("pulse.user");
    });
    await page.goto("/app/overview");
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });

  test("unauthorized route redirect @ui", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.goto("/app/overview");
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});

test.describe("@smoke auth-api-session", () => {
  test("refresh works @smoke", async ({ request }) => {
    const login = await apiLogin(request);
    test.skip(!login.refresh_token, "no refresh_token");
    const res = await request.post(`${API_URL}/auth/refresh`, {
      data: { refresh_token: login.refresh_token },
    });
    expect(res.ok()).toBeTruthy();
  });
});
