import { test, expect } from "@playwright/test";
import { API_URL, apiLogin } from "./fixtures";

test.describe("@smoke pos-sale", () => {
  test("complete grocery sale via authenticated API @smoke", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const headers = { Authorization: `Bearer ${access_token}` };

    const me = await request.get(`${API_URL}/auth/me`, { headers });
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();
    const storeId = meBody.store_id;

    const products = await request.get(`${API_URL}/products`, {
      headers,
      params: { q: "GROC-001" },
    });
    expect(products.ok()).toBeTruthy();
    const pdata = await products.json();
    const items = pdata.items || pdata;
    const product = items.find((p: { sku: string }) => p.sku === "GROC-001");
    expect(product).toBeTruthy();

    const stockBefore = await request.get(`${API_URL}/inventory/stock`, {
      headers,
      params: { store_id: storeId },
    });
    expect(stockBefore.ok()).toBeTruthy();
    const beforeRows = await stockBefore.json();
    const before = (beforeRows as { product_id: string; qty_on_hand: number }[])
      .filter((r) => r.product_id === product.id)
      .reduce((s, r) => s + Number(r.qty_on_hand || 0), 0);

    const price = Number(product.base_price || product.price || 100);
    const clientTx = `e2e-sale-${Date.now()}`;
    const sale = await request.post(`${API_URL}/sales`, {
      headers,
      data: {
        client_transaction_id: clientTx,
        industry_pack: "grocery",
        store_id: storeId,
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
        discount: 0,
        tax: 0,
        total: price,
        tender: "cash",
        payments: [{ method: "cash", amount: price }],
      },
    });
    expect(sale.status(), await sale.text()).toBe(200);
    const saleBody = await sale.json();
    expect(saleBody.id || saleBody.invoice_id).toBeTruthy();

    const stockAfter = await request.get(`${API_URL}/inventory/stock`, {
      headers,
      params: { store_id: storeId },
    });
    const afterRows = await stockAfter.json();
    const after = (afterRows as { product_id: string; qty_on_hand: number }[])
      .filter((r) => r.product_id === product.id)
      .reduce((s, r) => s + Number(r.qty_on_hand || 0), 0);
    expect(after).toBe(before - 1);

    // Idempotent retry must not double-post
    const retry = await request.post(`${API_URL}/sales`, {
      headers,
      data: {
        client_transaction_id: clientTx,
        industry_pack: "grocery",
        store_id: storeId,
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
      },
    });
    expect(retry.ok()).toBeTruthy();
    const retryBody = await retry.json();
    expect(retryBody.duplicate === true || retryBody.id === saleBody.id).toBeTruthy();

    const stockFinal = await request.get(`${API_URL}/inventory/stock`, {
      headers,
      params: { store_id: storeId },
    });
    const finalRows = await stockFinal.json();
    const finalQty = (finalRows as { product_id: string; qty_on_hand: number }[])
      .filter((r) => r.product_id === product.id)
      .reduce((s, r) => s + Number(r.qty_on_hand || 0), 0);
    expect(finalQty).toBe(after);
  });
});
