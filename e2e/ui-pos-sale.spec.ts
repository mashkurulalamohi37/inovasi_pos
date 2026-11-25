import { test, expect } from "@playwright/test";
import { API_URL, apiLogin, uiLogin } from "./fixtures";

/**
 * UI sale: enable grocery pack, open grocery POS, scan/add via barcode if cards empty,
 * complete sale, assert stock movement via API.
 */
test.describe("@ui pos-sale-ui", () => {
  test.beforeEach(() => {
    test.skip(process.env.E2E_UI !== "1" && !process.env.CI_E2E_UI, "Set E2E_UI=1");
  });

  test("grocery POS complete sale via UI @ui @p0", async ({ page, request }) => {
    const { access_token } = await apiLogin(request);
    const headers = { Authorization: `Bearer ${access_token}` };
    const me = await (await request.get(`${API_URL}/auth/me`, { headers })).json();
    const storeId = me.store_id;

    await request.patch(`${API_URL}/configuration/industry-packs/grocery`, {
      headers,
      data: { enabled_company: true, enabled_store: true, enabled_counter: true },
    });

    const products = await (await request.get(`${API_URL}/products`, { headers, params: { q: "GROC-001" } })).json();
    const product = (products.items || products).find((p: { sku: string }) => p.sku === "GROC-001");
    expect(product).toBeTruthy();
    const barcode = product.barcode || product.sku;

    const stockBeforeRows = await (
      await request.get(`${API_URL}/inventory/stock`, { headers, params: { store_id: storeId } })
    ).json();
    const qtyOf = (rows: { product_id: string; qty_on_hand: number }[]) =>
      rows.filter((r) => r.product_id === product.id).reduce((s, r) => s + Number(r.qty_on_hand || 0), 0);
    const before = qtyOf(stockBeforeRows);

    await uiLogin(page);
    await page.goto("/app/pos/grocery");
    await page.waitForTimeout(1500);
    if (await page.getByText(/is disabled/i).isVisible().catch(() => false)) {
      // Force reload after pack patch
      await page.reload();
      await page.waitForTimeout(1500);
    }
    await expect(page.getByText(/is disabled/i)).toHaveCount(0, { timeout: 20_000 }).catch(() => undefined);

    // Prefer barcode scan input if present
    const barcodeInput = page.locator('input[placeholder*="arcode" i], input[placeholder*="scan" i]').first();
    if (await barcodeInput.isVisible().catch(() => false)) {
      await barcodeInput.fill(String(barcode));
      await page.getByRole("button", { name: /scan/i }).click();
    } else {
      await page.getByText(new RegExp(product.sku || product.name.slice(0, 8), "i")).first().click({ timeout: 15_000 });
    }

    const charge = page.getByRole("button", { name: /Charge/i });
    await expect(charge).toBeEnabled({ timeout: 30_000 });
    await charge.click();
    await page.getByRole("button", { name: /Complete sale/i }).click();
    await expect(page.getByText(/Receipt|Complete|Processing|Invoice|success/i).first()).toBeVisible({
      timeout: 45_000,
    });

    const afterRows = await (
      await request.get(`${API_URL}/inventory/stock`, { headers, params: { store_id: storeId } })
    ).json();
    expect(qtyOf(afterRows)).toBe(before - 1);
  });
});
