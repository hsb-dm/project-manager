/* AI Hub's layer list scrolls on its own. Picking a row low in it draws the Properties panel again, and the list
   used to jump back to its first row; it keeps where it was now, and so does the panel. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("picking a layer low in the list keeps the list where it was", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const was = await page.evaluate(() => { go("aihub"); return JSON.stringify(AIF.extraLayers || []); });
  try {
    await page.evaluate(() => { for (let i = 0; i < 10; i++) aiAddTextLayer(); aiSelectLayer("canvas"); renderScreen(false); });
    const list = page.locator(".ai-props .ai-layer-list");
    await expect(list).toBeVisible();
    const rows = list.locator("[data-layer-id]");
    expect(await rows.count()).toBeGreaterThan(10);
    /* the list scrolls on its own: to its end */
    const before = await list.evaluate(el => { el.scrollTop = el.scrollHeight; return el.scrollTop; });
    expect(before, "the list is taller than its box").toBeGreaterThan(40);
    const last = rows.last(), id = await last.getAttribute("data-layer-id");
    await last.click({ position: { x: 60, y: 10 } });
    await page.waitForFunction(i => AIF.selectedLayer === i, id);
    await page.waitForTimeout(120);
    expect(Math.abs(await list.evaluate(el => el.scrollTop) - before), "still where it was").toBeLessThan(2);
    /* and the next pick, a row up */
    const prev = rows.nth((await rows.count()) - 2), pid = await prev.getAttribute("data-layer-id");
    await prev.click({ position: { x: 60, y: 10 } });
    await page.waitForFunction(i => AIF.selectedLayer === i, pid);
    await page.waitForTimeout(120);
    expect(Math.abs(await list.evaluate(el => el.scrollTop) - before)).toBeLessThan(2);
  } finally {
    await page.evaluate(w => { AIF.extraLayers = JSON.parse(w); AIF.selectedLayer = "canvas"; AIF.selectedLayers = []; renderScreen(false); }, was);
  }
});
