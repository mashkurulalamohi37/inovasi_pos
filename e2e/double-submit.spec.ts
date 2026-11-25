import { test, expect } from "@playwright/test";
import { API_URL, apiLogin } from "./fixtures";

/** Double-submit / idempotency — backend authority via rapid API retries (mirrors UI pending). */
test.describe("@smoke double-submit", () => {
  test("sale idempotent under rapid retry @smoke", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const headers = { Authorization: `Bearer ${access_token}` };
    const me = await (await request.get(`${API_URL}/auth/me`, { headers })).json();
    const products = await (await request.get(`${API_URL}/products`, { headers, params: { q: "GROC-001" } })).json();
    const product = (products.items || products).find((p: { sku: string }) => p.sku === "GROC-001");
    const price = Number(product.base_price || 100);
    const clientTx = `dbl-${Date.now()}`;
    const body = {
      client_transaction_id: clientTx,
      industry_pack: "grocery",
      store_id: me.store_id,
      status: "completed",
      lines: [
        {
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          qty: 1,
          unit_price: price,
          meta: {},
        },
      ],
      subtotal: price,
      tax: 0,
      total: price,
      tender: "cash",
      payments: [{ method: "cash", amount: price }],
    };
    const a = await request.post(`${API_URL}/sales`, { headers, data: body });
    const b = await request.post(`${API_URL}/sales`, { headers, data: body });
    expect(a.ok(), await a.text()).toBeTruthy();
    expect(b.ok(), await b.text()).toBeTruthy();
    const ja = await a.json();
    const jb = await b.json();
    const ida = ja.id || ja.invoice_id;
    const idb = jb.id || jb.invoice_id;
    expect(ida).toBeTruthy();
    expect(idb === ida || jb.duplicate === true || ja.duplicate === true).toBeTruthy();
  });
});
