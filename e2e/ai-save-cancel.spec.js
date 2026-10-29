/* AI Hub's "save the generated visual" goes through the upload tray like every other upload. Cancelling it there is
   the person's own choice: AI Hub says nothing in red (the tray's row says "Upload cancelled"), and no asset is
   added. A real failure still says so in red. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("a save from AI Hub cancelled in the upload tray says nothing in red; a failed one still does", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const was = await page.evaluate(() => { const c = cloudOf("gdrive"); c.config = c.config || {}; const w = c.config.storage; c.config.storage = "server"; go("aihub"); return { storage: w == null ? null : w, assets: ASSETS.length }; });
  /* hold the upload until it is cancelled or answered */
  let mode = "hold", release = null;
  await page.route("**/api/files/upload*", async route => {
    if (mode === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Disk full" }) });
    await new Promise(r => { release = r; });
    try { await route.abort(); } catch (e) { /* the page already gave up on it */ }
  });
  try {
    /* cancelled from the tray */
    await page.evaluate(() => aiSaveGeneratedToDrive());
    await expect.poll(() => page.evaluate(() => (uploadActive()[0] || {}).stage || ""), { timeout: 15000 }).toMatch(/uploading|preparing/);
    await expect(page.locator(".uptray")).toBeVisible();
    /* every red toast from here on is counted, however briefly it shows */
    await page.evaluate(() => { window.__redToasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains("bad")) window.__redToasts.push(n.textContent); }))).observe(document.getElementById("toasts"), { childList: true }); });
    await page.evaluate(() => uploadCancel(uploadActive()[0].id));
    await expect.poll(() => page.evaluate(() => UPLOADS[UPLOADS.length - 1].stage)).toBe("cancelled");
    if (release) release();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__redToasts), "no red toast for a cancel").toEqual([]);
    expect(await page.evaluate(n => ASSETS.length === n, was.assets)).toBe(true);

    /* a real failure is still said in red */
    mode = "fail";
    await page.evaluate(() => aiSaveGeneratedToDrive());
    await expect(page.locator("#toasts .toast.bad", { hasText: "Could not save the generated visual" })).toHaveCount(1, { timeout: 15000 });
    expect(await page.evaluate(n => ASSETS.length === n, was.assets)).toBe(true);
  } finally {
    await page.unroute("**/api/files/upload*");
    await page.evaluate(w => { const c = cloudOf("gdrive"); if (w.storage == null) delete c.config.storage; else c.config.storage = w.storage; }, was);
  }
});
