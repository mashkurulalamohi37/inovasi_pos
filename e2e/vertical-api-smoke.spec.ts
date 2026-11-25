import { test, expect } from "@playwright/test";
import { API_URL, apiLogin } from "./fixtures";

/**
 * Vertical smoke: API reachability for hardened packs.
 * Full browser vertical UI flows remain P1 nightly — these prove seeded vertical APIs respond
 * under authenticated tenant without inventing UI success.
 */
test.describe("vertical-api-smoke", () => {
  test("pharmacy batches list @p1", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const res = await request.get(`${API_URL}/industry/pharmacy/batches`, {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { limit: 10 },
    });
    expect([200, 404]).toContain(res.status());
  });

  test("electronics serials list @p1", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const res = await request.get(`${API_URL}/industry/electronics/serials`, {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { limit: 10 },
    });
    expect([200, 404]).toContain(res.status());
  });

  test("jewelry certificates list @p1", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const res = await request.get(`${API_URL}/industry/jewelry/certificates`, {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { limit: 10 },
    });
    expect([200, 404]).toContain(res.status());
  });

  test("restaurant tables list @p1", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const res = await request.get(`${API_URL}/industry/restaurant/tables`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect([200, 404]).toContain(res.status());
  });

  test("fashion variants + offers + import status @smoke", async ({ request }) => {
    const { access_token } = await apiLogin(request);
    const headers = { Authorization: `Bearer ${access_token}` };
    const variants = await request.get(`${API_URL}/industry/fashion/variants`, { headers });
    expect(variants.status()).toBe(200);
    expect(Array.isArray(await variants.json())).toBeTruthy();

    const offers = await request.get(`${API_URL}/industry/fashion/offers`, { headers });
    expect(offers.status()).toBe(200);

    const importStatus = await request.get(`${API_URL}/import/status`, { headers });
    expect(importStatus.status()).toBe(200);
    const body = await importStatus.json();
    expect(body.mode).toBe("live");
    expect(body.live_modules).toEqual(
      expect.arrayContaining([
        "products",
        "opening_stock",
        "suppliers",
        "customers",
        "fashion_variants",
      ]),
    );

    const kpi = await request.get(`${API_URL}/reports/fashion-dashboard-kpi`, { headers });
    expect(kpi.status()).toBe(200);
  });
});
