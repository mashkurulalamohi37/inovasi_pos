import { test, expect } from "@playwright/test";
import { API_URL, apiLogin } from "./fixtures";

/**
 * Purchase → approve → GRN receive → stock increase → sale → stock decrease.
 * Exercises real FastAPI + PostgreSQL (or whatever DB the API is configured with).
 * Do not run against MSW.
 */
test.describe("@smoke purchase-lifecycle", () => {
  test("PO approve receive then sale @smoke", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const headers = { Authorization: `Bearer ${access_token}` };

    const me = await (await request.get(`${API_URL}/auth/me`, { headers })).json();
    const storeId = me.store_id;

    const suppliersRes = await request.get(`${API_URL}/suppliers`, { headers, params: { limit: 5 } });
    expect(suppliersRes.ok(), await suppliersRes.text()).toBeTruthy();
    const suppliersBody = await suppliersRes.json();
    const suppliers = suppliersBody.items || suppliersBody;
    expect(suppliers.length).toBeGreaterThan(0);
    const supplierId = suppliers[0].id;

    const products = await (await request.get(`${API_URL}/products`, { headers, params: { q: "GROC-001" } })).json();
    const product = (products.items || products).find((p: { sku: string }) => p.sku === "GROC-001");
    expect(product).toBeTruthy();

    const stockBeforeRes = await request.get(`${API_URL}/inventory/stock`, {
      headers,
      params: { store_id: storeId },
    });
    expect(stockBeforeRes.ok()).toBeTruthy();
    const beforeRows = await stockBeforeRes.json();
    const qtyOf = (rows: { product_id: string; qty_on_hand: number }[]) =>
      rows.filter((r) => r.product_id === product.id).reduce((s, r) => s + Number(r.qty_on_hand || 0), 0);
    const before = qtyOf(beforeRows);

    const create = await request.post(`${API_URL}/purchases`, {
      headers,
      data: {
        supplier_id: supplierId,
        store_id: storeId,
        lines: [{ product_id: product.id, qty: 2, unit_cost: 50 }],
      },
    });
    expect(create.status(), await create.text()).toBe(200);
    const purchase = await create.json();

    const approve = await request.post(`${API_URL}/purchases/${purchase.id}/approve`, { headers });
    expect(approve.ok(), await approve.text()).toBeTruthy();

    const receive = await request.post(`${API_URL}/purchases/${purchase.id}/receive`, {
      headers,
      data: { lines: [{ purchase_line_id: purchase.lines[0].id, qty: 2 }] },
    });
    expect(receive.status(), await receive.text()).toBe(200);

    const midRows = await (
      await request.get(`${API_URL}/inventory/stock`, { headers, params: { store_id: storeId } })
    ).json();
    expect(qtyOf(midRows)).toBe(before + 2);

    // Direct purchase & receive (auto PO + GRN)
    const directBeforeRows = await (
      await request.get(`${API_URL}/inventory/stock`, { headers, params: { store_id: storeId } })
    ).json();
    const directBefore = qtyOf(directBeforeRows);
    const direct = await request.post(`${API_URL}/purchases/direct-receive`, {
      headers,
      data: {
        supplier_id: supplierId,
        store_id: storeId,
        lines: [{ product_id: product.id, qty: 4, unit_cost: 50 }],
      },
    });
    expect(direct.status(), await direct.text()).toBe(200);
    const directBody = await direct.json();
    expect(directBody.receive_no).toBeTruthy();
    expect(directBody.purchase.status).toBe("RECEIVED");
    const afterDirectRows = await (
      await request.get(`${API_URL}/inventory/stock`, { headers, params: { store_id: storeId } })
    ).json();
    expect(qtyOf(afterDirectRows)).toBe(directBefore + 4);

    const price = Number(product.base_price || 100);
    const sale = await request.post(`${API_URL}/sales`, {
      headers,
      data: {
        client_transaction_id: `e2e-po-sale-${Date.now()}`,
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
    expect(sale.status(), await sale.text()).toBe(200);

    const afterRows = await (
      await request.get(`${API_URL}/inventory/stock`, { headers, params: { store_id: storeId } })
    ).json();
    expect(qtyOf(afterRows)).toBe(before + 1);

    const ledger = await request.get(`${API_URL}/suppliers/${supplierId}/ledger`, {
      headers,
    });
    expect(ledger.ok(), await ledger.text()).toBeTruthy();
  });
});
