import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    // the popup blocker stays on so the isolation tests (sources.spec.ts) see what a real browser would
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"], ignoreDefaultArgs: ["--disable-popup-blocking"] }
  },
  webServer: [
    { command: "npm run preview", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: "node tests/e2e/fixtures/serve.mjs", url: "http://127.0.0.1:4174/host.html", reuseExistingServer: !process.env.CI }
  ],
  // full Chromium (new headless) rather than the headless shell: it keeps the real popup blocker
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }]
});
