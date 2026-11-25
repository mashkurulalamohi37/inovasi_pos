import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL || "http://127.0.0.1:9001/api/v1";
export const COMPANY_CODE = process.env.E2E_COMPANY_CODE || "PULSE-DEMO";
export const E2E_EMAIL = process.env.E2E_EMAIL || "admin@pulse.pos";
export const E2E_PASSWORD = process.env.E2E_PASSWORD || "admin123";

export async function apiLogin(request: APIRequestContext) {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: {
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      company_code: COMPANY_CODE,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  expect(body.access_token).toBeTruthy();
  return body as { access_token: string; refresh_token?: string };
}

/** Real browser login against live frontend + FastAPI (workspace verify → credentials). */
export async function uiLogin(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const company = page.locator("#workspace-code");
  await expect(company).toBeVisible({ timeout: 20_000 });
  await company.click();
  await company.fill("");
  await company.type(COMPANY_CODE, { delay: 20 });
  await expect(company).toHaveValue(COMPANY_CODE);
  await page.getByRole("button", { name: /^Verify to continue$/i }).click();
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 25_000 });
  await page.locator('.auth-slide-form--signin input[type="email"]').fill(E2E_EMAIL);
  await page.locator('.auth-slide-form--signin input[type="password"]').fill(E2E_PASSWORD);
  await page.locator('.auth-slide-form--signin button[type="submit"]').click();
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

export async function uiLogout(page: Page) {
  await page.evaluate(async () => {
    localStorage.removeItem("pulse.accessToken");
    localStorage.removeItem("pulse.refreshToken");
    localStorage.removeItem("pulse.user");
    sessionStorage.clear();
  });
  await page.goto("/login");
  await page.waitForURL(/\/login/, { timeout: 20_000 });
}
