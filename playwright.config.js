/* Browser tests for the eight flows that must never break (docs/ARCHITECTURE-REVIEW-v38.md, P1 pipeline).
   npm run e2e   — builds, starts a clean production-mode server on :3310, runs Chromium.
   The dropdowns by touch on phones and tablets (e2e/touch-dropdowns.spec.js) run only in their own two projects,
   WebKit (iPhone, iPad) and Chromium (Android): npx playwright install webkit once. */
const { defineConfig } = require("@playwright/test");
const port = process.env.E2E_PORT || "3310";
const TOUCH = /touch-dropdowns\.spec\.js$/;
module.exports = defineConfig({
  testDir: "e2e", timeout: 60000, retries: process.env.CI ? 1 : 0, workers: 1, fullyParallel: false,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]] : "list",
  use: { baseURL: "http://localhost:" + port, trace: "retain-on-failure", screenshot: "only-on-failure", viewport: { width: 1360, height: 860 } },
  projects: [
    { name: "chromium", testIgnore: TOUCH, use: { browserName: "chromium" } },
    { name: "webkit-touch", testMatch: TOUCH, use: { browserName: "webkit" } },
    { name: "chromium-touch", testMatch: TOUCH, use: { browserName: "chromium" } }
  ],
  outputDir: "e2e/results",
  webServer: { command: "node e2e/serve.js", url: "http://localhost:" + port + "/api/health", reuseExistingServer: false, timeout: 30000 }
});
