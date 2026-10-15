/* A tab left open across an update keeps the page it loaded. Every API reply says which page the server serves
   (X-ZC-Build); when it is another, a bar at the top offers to reload — never by itself. A tab nobody touches checks
   when it is looked at again. "Later" puts the bar away until the next update; Reload brings the new page, as it was. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("a new version is offered in a tab left open, and Reload brings it", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const bar = page.locator("#zcNewVersion");
  /* the page carries its version, and the server serves the same one: nothing to offer */
  expect(await page.evaluate(() => ZC_BUILD)).toMatch(/^[0-9a-f]{12}$/);
  expect(await page.evaluate(() => fetch("/api/auth/status").then(r => r.headers.get("X-ZC-Build") === ZC_BUILD)), "the server says the page it serves").toBe(true);
  await page.evaluate(() => apiFetch("GET", "/api/auth/status"));
  await expect(bar).toHaveCount(0);

  /* the server now serves another: a tab looked at again finds out */
  let served = "0123456789ab";
  await page.route("**/api/auth/status", async r => { const res = await r.fetch(); await r.fulfill({ response: res, headers: Object.assign({}, res.headers(), { "x-zc-build": served }) }); });
  await page.evaluate(() => { ZC_BUILD_CHECKED = 0; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(bar).toContainText("A new version of ZenCrevia is ready.");
  await expect(bar.getByRole("button", { name: "Reload" })).toBeVisible();
  expect(await bar.evaluate(el => [getComputedStyle(el).position, getComputedStyle(el).animationName])).toEqual(["fixed", "none"]);
  /* in Indonesian */
  await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
  await expect(bar).toContainText("Versi baru ZenCrevia sudah siap.");
  await expect(bar.getByRole("button", { name: "Muat ulang" })).toBeVisible();
  await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
  /* Later: away until the next update */
  await bar.getByRole("button", { name: "Later" }).click();
  await expect(bar).toHaveCount(0);
  await page.evaluate(() => apiFetch("GET", "/api/auth/status"));
  await expect(bar).toHaveCount(0);
  served = "ba9876543210";
  await page.evaluate(() => apiFetch("GET", "/api/auth/status"));
  await expect(bar).toBeVisible();
  /* Reload: the page the server serves, and no bar */
  await page.unroute("**/api/auth/status");
  await bar.getByRole("button", { name: "Reload" }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  await page.evaluate(() => apiFetch("GET", "/api/auth/status"));
  await expect(bar).toHaveCount(0);
});
