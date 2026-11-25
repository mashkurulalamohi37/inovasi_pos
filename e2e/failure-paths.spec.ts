import { test, expect } from "@playwright/test";
import { API_URL, apiLogin, COMPANY_CODE, E2E_EMAIL } from "./fixtures";

test.describe("failure-paths", () => {
  test("stock oversell returns 409 @smoke", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const headers = { Authorization: `Bearer ${access_token}` };
    const me = await (await request.get(`${API_URL}/auth/me`, { headers })).json();
    const products = await (await request.get(`${API_URL}/products`, { headers, params: { q: "GROC-001" } })).json();
    const product = (products.items || products).find((p: { sku: string }) => p.sku === "GROC-001");
    expect(product).toBeTruthy();

    const sale = await request.post(`${API_URL}/sales`, {
      headers,
      data: {
        client_transaction_id: `e2e-oversell-${Date.now()}`,
        industry_pack: "grocery",
        store_id: me.store_id,
        status: "completed",
        lines: [
          {
            product_id: product.id,
            sku: product.sku,
            name: product.name,
            qty: 999999,
            unit_price: 1,
            meta: {},
          },
        ],
        subtotal: 999999,
        tax: 0,
        total: 999999,
        tender: "cash",
        payments: [{ method: "cash", amount: 999999 }],
      },
    });
    expect(sale.status()).toBe(409);
    const body = await sale.json();
    expect(String(body.detail || "").toLowerCase()).toMatch(/stock|insufficient/);
  });

  test("forbidden without token @smoke", async ({ request }) => {
    const res = await request.get(`${API_URL}/configuration/role-permissions`);
    expect([401, 403]).toContain(res.status());
  });

  test("invalid company login @smoke", async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/login`, {
      data: { email: E2E_EMAIL, password: "admin123", company_code: "NO-SUCH-TENANT" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    void COMPANY_CODE;
  });
});
