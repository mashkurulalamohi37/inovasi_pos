import { expect, test } from "@playwright/test";
import { API_URL, COMPANY_CODE, apiLogin, uiLogin, uiLogout } from "./fixtures";

/**
 * STEP 28A — Mini HR employee access E2E (Browser → Frontend → FastAPI → PostgreSQL).
 * No MSW. Proves Employee → Auth → RBAC → Menu → Store scope.
 */
test.describe("Mini HR employee access", () => {
  test("owner creates employee login; employee menus and APIs respect RBAC + store scope", async ({
    page,
    request,
  }) => {
    const admin = await apiLogin(request);
    const headers = { Authorization: `Bearer ${admin.access_token}` };

    const storesRes = await request.get(`${API_URL}/org/stores`, { headers });
    expect(storesRes.ok()).toBeTruthy();
    let stores = await storesRes.json();
    if (stores.length < 2) {
      const created = await request.post(`${API_URL}/org/stores`, {
        headers,
        data: { code: `E2E-HR-${Date.now()}`, name: "E2E HR Store B" },
      });
      expect(created.ok(), await created.text()).toBeTruthy();
      stores = await (await request.get(`${API_URL}/org/stores`, { headers })).json();
    }
    const storeA = stores[0].id as string;
    const storeB = stores[1].id as string;

    const suffix = Date.now().toString().slice(-6);
    const empRes = await request.post(`${API_URL}/mini-hr/employees`, {
      headers,
      data: {
        employee_code: `E2E${suffix}`,
        first_name: "E2E",
        last_name: "Cashier",
        primary_store_id: storeA,
      },
    });
    expect(empRes.ok(), await empRes.text()).toBeTruthy();
    const emp = await empRes.json();

    const username = `e2e.cash.${suffix}`;
    const password = `E2ePass${suffix}!`;
    const loginRes = await request.post(`${API_URL}/mini-hr/employees/${emp.id}/create-user`, {
      headers,
      data: { username, temporary_password: password, role_code: "Cashier" },
    });
    expect(loginRes.ok(), await loginRes.text()).toBeTruthy();

    // Owner UI: HR visible
    await uiLogin(page);
    await page.goto("/app/hr");
    await expect(page.getByRole("heading", { name: /HR Dashboard/i })).toBeVisible({ timeout: 30_000 });
    await page.goto("/app/hr/employees");
    await expect(page.getByText(emp.employee_code)).toBeVisible({ timeout: 20_000 });
    await uiLogout(page);

    // Employee UI login
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.locator("#workspace-code").fill(COMPANY_CODE);
    await page.getByRole("button", { name: /^Verify to continue$/i }).click();
    await expect(page.locator('.auth-slide-form--signin input[type="text"], .auth-slide-form--signin input[autocomplete="username"]').first()).toBeVisible({ timeout: 25_000 });
    await page.locator(".auth-slide-form--signin input").first().fill(username);
    await page.locator('.auth-slide-form--signin input[type="password"]').fill(password);
    await page.locator('.auth-slide-form--signin button[type="submit"]').click();
    await page.waitForURL(/\/app\//, { timeout: 45_000 });

    // Allowed menu
    await expect(page.getByRole("link", { name: /POS Lane/i }).first()).toBeVisible({ timeout: 20_000 });
    // Forbidden menus
    await expect(page.getByRole("link", { name: /^HR Dashboard$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Purchases$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Role Permissions/i })).toHaveCount(0);

    // Forbidden API
    const token = await page.evaluate(() => localStorage.getItem("pulse.accessToken"));
    expect(token).toBeTruthy();
    const empHdr = { Authorization: `Bearer ${token}` };
    const hrDenied = await request.get(`${API_URL}/mini-hr/employees`, { headers: empHdr });
    expect(hrDenied.status()).toBe(403);
    const purchaseDenied = await request.post(`${API_URL}/purchases`, {
      headers: empHdr,
      data: { supplier_id: "x", store_id: storeA, lines: [] },
    });
    expect([401, 403, 404, 422]).toContain(purchaseDenied.status());

    // Store scope
    const salesA = await request.get(`${API_URL}/sales`, { headers: empHdr, params: { store_id: storeA } });
    expect(salesA.ok()).toBeTruthy();
    const salesB = await request.get(`${API_URL}/sales`, { headers: empHdr, params: { store_id: storeB } });
    expect(salesB.status()).toBe(403);
  });
});
