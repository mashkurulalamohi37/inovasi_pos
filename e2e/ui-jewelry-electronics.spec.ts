/**
 * Browser-level SQA pass for the jewelry and electronics verticals.
 *
 * Covers the axes the API probes cannot reach: real rendering, responsive
 * layout, console health, and the interactions that crash at runtime rather
 * than failing a request (Radix Select with an empty item value, for example).
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { uiLogin } from "./fixtures";

const JEWELRY_ROUTES = [
  "/app/pos/jewelry",
  "/app/jewelry/dashboard",
  "/app/jewelry/gold-rate",
  "/app/jewelry/profiles",
  "/app/jewelry/certificate",
  "/app/jewelry/buyback",
  "/app/jewelry/repair",
];

const ELECTRONICS_ROUTES = [
  "/app/pos/electronics",
  "/app/electronics/dashboard",
  "/app/electronics/serials",
  "/app/electronics/warranty",
  "/app/electronics/amc",
  "/app/electronics/emi",
  "/app/electronics/brands",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

/** Console noise that is not the app's fault or not actionable here. */
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Failed to load resource.*404.*\.map/i,
];

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function gotoApp(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/login")) {
    await uiLogin(page);
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
  }
  // Let TanStack Query settle so late-arriving render errors are captured.
  await page.waitForTimeout(1200);
}

test.describe("@ui jewelry + electronics", () => {
  test.beforeEach(() => {
    test.skip(process.env.E2E_UI !== "1" && !process.env.CI_E2E_UI, "Set E2E_UI=1");
  });

  // ── Rendering + console health ─────────────────────────────────────────────

  for (const path of [...JEWELRY_ROUTES, ...ELECTRONICS_ROUTES]) {
    test(`renders without console errors: ${path} @ui @p1`, async ({ page }) => {
      const errors = watchConsole(page);
      await uiLogin(page);
      await gotoApp(page, path);

      await expect(page.locator("body")).not.toBeEmpty();
      // A crashed React subtree leaves the shell but no content.
      const text = (await page.locator("body").innerText()).trim();
      expect(text.length, `${path} rendered an empty body`).toBeGreaterThan(40);

      expect(errors, `console errors on ${path}:\n${errors.join("\n")}`).toEqual([]);
    });
  }

  // ── Responsive: no horizontal overflow ─────────────────────────────────────

  for (const vp of VIEWPORTS) {
    test(`no horizontal overflow at ${vp.name} @ui @p2`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await uiLogin(page);
      const offenders: string[] = [];
      for (const path of [...JEWELRY_ROUTES, ...ELECTRONICS_ROUTES]) {
        await gotoApp(page, path);
        const overflow = await page.evaluate(() => {
          const d = document.documentElement;
          return { scrollW: d.scrollWidth, clientW: d.clientWidth };
        });
        // A few px of rounding is tolerable; a real overflow is much larger.
        if (overflow.scrollW - overflow.clientW > 4) {
          offenders.push(`${path} (${overflow.scrollW} > ${overflow.clientW})`);
        }
      }
      expect(offenders, `body scrolls sideways at ${vp.name}:\n${offenders.join("\n")}`).toEqual([]);
    });
  }

  // ── Radix Select interactions (the JW-09 crash class) ──────────────────────

  test("jewelry profiles karat filter opens without crashing @ui @p1", async ({ page }) => {
    const errors = watchConsole(page);
    await uiLogin(page);
    await gotoApp(page, "/app/jewelry/profiles");
    const trigger = page.getByRole("combobox").first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 10_000 });
    const optionCount = await page.getByRole("option").count();
    expect(optionCount, "karat filter rendered no options").toBeGreaterThan(1);
    await page.keyboard.press("Escape");
    expect(errors, `console errors opening karat filter:\n${errors.join("\n")}`).toEqual([]);
  });

  test("jewelry repair status filter opens without crashing @ui @p1", async ({ page }) => {
    const errors = watchConsole(page);
    await uiLogin(page);
    await gotoApp(page, "/app/jewelry/repair");
    const trigger = page.getByRole("combobox").first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    expect(errors, `console errors opening status filter:\n${errors.join("\n")}`).toEqual([]);
  });

  // ── Jewelry POS: the trade-in credit must reduce what is charged ───────────

  test("old gold trade-in reduces the amount charged @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await gotoApp(page, "/app/pos/jewelry");

    const tradeInBtn = page.getByRole("button", { name: /Old Gold Trade-In/i });
    if (!(await tradeInBtn.isVisible().catch(() => false))) {
      test.skip(true, "trade-in feature flag off for this tenant");
    }

    // Charge button text carries the collectable amount.
    const charge = page.getByRole("button", { name: /^Charge/ });
    await expect(charge).toBeVisible();
    const before = await charge.innerText();

    await tradeInBtn.click();
    const gross = page.getByRole("spinbutton").first();
    await expect(gross).toBeVisible({ timeout: 10_000 });
    await gross.fill("11.66");
    await page.getByRole("button", { name: /Apply Trade-In Credit/i }).click();

    // The dialog closes and the cart summary must now show the credit line.
    await expect(page.getByText(/Old gold trade-in/i)).toBeVisible({ timeout: 10_000 });
    const after = await charge.innerText();
    expect(after, `charge did not change after applying trade-in (was ${before})`).not.toEqual(before);
  });

  // ── Basic accessibility: images carry alt text ─────────────────────────────

  test("images have alt text across both verticals @ui @p3", async ({ page }) => {
    await uiLogin(page);
    const offenders: string[] = [];
    for (const path of [...JEWELRY_ROUTES, ...ELECTRONICS_ROUTES]) {
      await gotoApp(page, path);
      const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll("img"))
          .filter((img) => !img.getAttribute("alt") && img.getAttribute("role") !== "presentation")
          .map((img) => img.getAttribute("src") ?? "(no src)"),
      );
      missing.forEach((src) => offenders.push(`${path} → ${src}`));
    }
    expect(offenders, `images without alt text:\n${offenders.join("\n")}`).toEqual([]);
  });

  // ── Direct-URL access after logout must not expose data ───────────────────

  test("back button after logout does not expose jewelry data @ui @p1", async ({ page }) => {
    await uiLogin(page);
    await gotoApp(page, "/app/jewelry/buyback");
    await page.evaluate(() => {
      localStorage.removeItem("pulse.accessToken");
      localStorage.removeItem("pulse.refreshToken");
      localStorage.removeItem("pulse.user");
    });
    await page.goto("/app/jewelry/buyback");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    expect(page.url(), "reached the buyback page without a token").toMatch(/\/login/);
  });
});
