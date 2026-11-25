import { test, expect } from "@playwright/test";
import { uiLogin } from "./fixtures";

async function expectAppShell(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  // Client navigation after SSR may briefly hit login; wait for app or re-assert auth
  if (page.url().includes("/login")) {
    await uiLogin(page);
    await page.goto(path);
  }
  await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
  await expect(page.locator("body")).not.toBeEmpty();
}

test.describe("@ui vertical-ui", () => {
  test.beforeEach(() => {
    test.skip(process.env.E2E_UI !== "1" && !process.env.CI_E2E_UI, "Set E2E_UI=1");
  });

  test("pharmacy POS page loads @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/pos/pharmacy");
  });

  test("mobile POS page loads @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/pos/mobile-shop");
  });

  test("restaurant POS loads @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/pos/restaurant");
  });

  test("optical orders UI @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/optical-shop/orders");
  });

  test("salon appointments UI @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/salon/appointments");
  });

  test("building delivery UI @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/building-materials/delivery");
  });

  test("cosmetics POS loads @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/pos/cosmetics");
  });

  test("stationery school lists UI @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/stationery/school-lists");
  });

  test("purchases page UI @ui @p0", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/purchases");
  });

  test("sales history UI @ui @p0", async ({ page }) => {
    await uiLogin(page);
    await expectAppShell(page, "/app/sales");
  });
});
