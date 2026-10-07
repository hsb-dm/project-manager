/* An asset is renamed in its window: the name reads as the title until it is clicked; Enter or a
   click elsewhere saves, Assets shows the new name, and an empty name is refused. In Indonesian the
   hint reads "Klik untuk mengganti nama". The server's rules: tests/asset-rename.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("an asset is renamed from its window", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const id = "as_rename_" + Date.now().toString(36);
  await page.evaluate(async i => { const list = await apiFetch("POST", "/api/assets", { id: i, name: "motio freelance", type: "video", folder: (ASSET_FOLDERS[0] || {}).id, url: "https://drive.google.com/drive/folders/13hlA7_hUzd9fgigBwqf4W5ZQTdHVp3iP", source: "gdrive" }); ASSETS = list.map(hAsset); }, id);
  const server = () => page.evaluate(i => apiFetch("GET", "/api/bootstrap").then(d => (d.assets.find(a => a.id === i) || {}).name), id);
  try {
    await page.evaluate(i => { go("assets"); openAsset(i); }, id);
    const name = page.locator("#modal #as_name");
    await expect(name).toHaveValue("motio freelance");
    await expect(name).toHaveAttribute("title", "Click to rename");
    await name.click();
    await name.fill("Motion reel — freelance");
    await name.press("Enter");
    await expect(page.locator(".toast").last()).toContainText("Name saved");
    await expect.poll(server).toBe("Motion reel — freelance");
    await page.evaluate(() => closeModal());
    await expect(page.locator("#content", { hasText: "Motion reel — freelance" })).toBeVisible();

    /* empty: refused, and the name comes back */
    await page.evaluate(i => openAsset(i), id);
    await page.locator("#modal #as_name").fill("   ");
    await page.locator("#modal .meta").first().click();   /* a click elsewhere */
    await expect(page.locator(".toast").last()).toContainText("The name cannot be empty");
    await expect(page.locator("#modal #as_name")).toHaveValue("Motion reel — freelance");
    expect(await server()).toBe("Motion reel — freelance");

    /* in Indonesian */
    await page.evaluate(i => { closeModal(); setLanguage("id"); openAsset(i); }, id);
    await expect(page.locator("#modal #as_name")).toHaveAttribute("title", "Klik untuk mengganti nama");
    await page.evaluate(() => { closeModal(); setLanguage("en"); });
  } finally { await page.evaluate(i => apiFetch("DELETE", "/api/assets/" + i).catch(() => {}), id); }
});
