/* Loaded from a server, the app never shows the bundled demo workspace — not even for a moment.

   It used to: while the session was checked the sign-in screen offered "Demo mode" and the demo
   accounts, and once signed in the account button and the counters showed demo data until the real
   workspace arrived. Now the first screen only says it is connecting, the demo records are dropped
   before anything is drawn, and the page stays hidden until the workspace is in. The standalone
   file still opens in demo mode. */
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const DEMO_IDS = ["zein", "sarah", "laura", "rizky", "maya", "dian", "andi"];
const slow = (page, pattern, ms) => page.route(pattern, async r => { await new Promise(x => setTimeout(x, ms)); await r.continue(); });

test("while the session is checked, the first screen shows no demo accounts", async ({ page }) => {
  /* held long enough to outlast loading the page itself */
  await slow(page, "**/api/auth/session", 4000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-loader .sk-flow")).toBeVisible();
  await expect(page.locator(".authcard"), "no card that turns into another a moment later").toHaveCount(0);
  await expect(page.locator(".demo-user-card")).toHaveCount(0);
  await expect(page.locator("#content")).not.toContainText("Demo mode");
  const people = await page.evaluate(() => Object.keys(PEOPLE));
  for (const id of DEMO_IDS) expect(people, "no demo account in the page").not.toContain(id);
  /* and then the sign-in form */
  await expect(page.locator("#au_email")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".demo-user-card")).toHaveCount(0);
});

test("signed in, nothing of the demo shows before the workspace arrives", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await slow(page, "**/api/bootstrap", 1500);
  await page.reload();
  await page.waitForFunction(() => typeof SESSION !== "undefined" && SESSION.user);
  /* the session is in, the workspace is not yet */
  expect(await page.evaluate(() => document.documentElement.classList.contains("zc-booting")), "still hidden").toBe(true);
  const early = await page.evaluate(() => ({ people: Object.keys(PEOPLE), notifs: NOTIFS.length, me: document.getElementById("meBtn").textContent, meHidden: getComputedStyle(document.getElementById("meBtn")).visibility }));
  for (const id of DEMO_IDS) expect(early.people).not.toContain(id);
  expect(early.notifs).toBe(0);
  expect(early.meHidden).toBe("hidden");
  await expect(page.locator(".boot-loader .sk-flow"), "the loader, until the workspace is in").toHaveCount(1);
  for (const id of DEMO_IDS) expect(early.me.toLowerCase()).not.toContain(id);
  /* then the real workspace, shown */
  await ready(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("zc-booting"))).toBe(false);
  await expect(page.locator("#meBtn")).toBeVisible();
  await expect(page.locator("#meBtn")).toContainText("Admin");
});

test("the standalone file still opens in demo mode", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "..", "dist", "creative-os-standalone.html")).href);
  await expect(page.locator(".demo-user-card").first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#content")).toContainText("Demo mode");
});
