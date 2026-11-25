import { test, expect } from "@playwright/test";
import { API_URL, apiLogin } from "./fixtures";

/**
 * Fashion POS API smoke — sale with size×color variant_id (Mode A online).
 * Browser Fashion POS UI remains optional nightly.
 */
test.describe("@smoke fashion-pos-sale", () => {
  test("complete fashion sale with variant_id @smoke", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const headers = { Authorization: `Bearer ${access_token}` };

    const me = await request.get(`${API_URL}/auth/me`, { headers });
    expect(me.ok()).toBeTruthy();
    const storeId = (await me.json()).store_id;

    const variantsRes = await request.get(`${API_URL}/industry/fashion/variants`, { headers });
    expect(variantsRes.ok()).toBeTruthy();
    const variants = await variantsRes.json();
    const variant = (variants as Array<{
      id: string;
      product_id: string;
      sku?: string;
      variant_code?: string;
      size?: string;
      color?: string;
      editable?: boolean;
      source?: string;
    }>).find((v) => v.variant_code?.startsWith("FASH-001") || v.sku?.startsWith("FASH-001"));
    expect(variant, "seeded FASH-001 variant").toBeTruthy();

    const products = await request.get(`${API_URL}/products`, {
      headers,
      params: { q: "FASH-001" },
    });
    expect(products.ok()).toBeTruthy();
    const pdata = await products.json();
    const items = pdata.items || pdata;
    const product = items.find((p: { sku: string }) => p.sku === "FASH-001");
    expect(product).toBeTruthy();

    const price = Math.max(Number(product.base_price || 2490), 990);
    const clientTx = `e2e-fash-${Date.now()}`;
    const sale = await request.post(`${API_URL}/sales`, {
      headers,
      data: {
        client_transaction_id: clientTx,
        industry_pack: "fashion",
        store_id: storeId,
        lines: [
          {
            product_id: product.id,
            sku: product.sku,
            name: product.name,
            qty: 1,
            unit_price: price,
            meta: {
              variant_id: variant!.id,
              size: variant!.size,
              color: variant!.color,
            },
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
    const invoice = await sale.json();
    expect(invoice.id).toBeTruthy();

    const retry = await request.post(`${API_URL}/sales`, {
      headers,
      data: {
        client_transaction_id: clientTx,
        industry_pack: "fashion",
        store_id: storeId,
        lines: [
          {
            product_id: product.id,
            sku: product.sku,
            name: product.name,
            qty: 1,
            unit_price: price,
            meta: { variant_id: variant!.id },
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
    expect(retry.status()).toBe(200);
    expect((await retry.json()).id).toBe(invoice.id);
  });
});
