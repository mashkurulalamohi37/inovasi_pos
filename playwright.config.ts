import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const apiURL = process.env.E2E_API_URL || "http://127.0.0.1:9001/api/v1";
const runUI = process.env.E2E_UI === "1" || !!process.env.CI_E2E_UI;
const browsers = (process.env.E2E_BROWSERS || "chromium").split(",").map((s) => s.trim());

const projects = [] as { name: string; use: object }[];
if (browsers.includes("chromium")) {
  projects.push({ name: "chromium", use: { ...devices["Desktop Chrome"] } });
}
if (browsers.includes("firefox")) {
  projects.push({ name: "firefox", use: { ...devices["Desktop Firefox"] } });
}
if (browsers.includes("webkit")) {
  projects.push({ name: "webkit", use: { ...devices["Desktop Safari"] } });
}
if (browsers.includes("mobile")) {
  projects.push({ name: "mobile-chrome", use: { ...devices["Pixel 7"] } });
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects,
  webServer: runUI
    ? [
        {
          command: "npm run dev -- --host 127.0.0.1 --port 3000",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            ...process.env,
            VITE_API_URL: apiURL,
          },
        },
      ]
    : undefined,
});
