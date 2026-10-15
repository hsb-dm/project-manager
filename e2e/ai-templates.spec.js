/* AI Hub templates from the canvas (Oct 2026): what is on the canvas is saved as a template for everyone (pictures
   as files), opened again from the picker exactly as it was, changed on the canvas and saved back over itself, and
   removed. The button is only there for a role with save_ai_templates. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const PNG = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "fixtures", "red.png")).toString("base64");

test("a canvas becomes a template for everyone, opens as it was, is changed from the canvas and removed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const before = await page.evaluate(() => JSON.parse(JSON.stringify((WS.ai && WS.ai.promptTemplates) || null)));
  try {
    await page.evaluate(() => go("aihub"));
    await page.locator(".ai-template-card", { hasText: "Educational feed" }).click();
    /* the design: a new headline and a picture */
    await page.evaluate(png => { AIF.headline = "Template E2E headline"; AIF.extraLayers = (AIF.extraLayers || []).concat([{ id: "e2epic", name: "Picture", type: "image", src: png, x: 50, y: 50, w: 20 }]); renderScreen(false); }, PNG);
    const save = page.getByRole("button", { name: "Save as template" });
    await save.click();
    /* the template it came from can be updated; this time it is a new one */
    await expect(page.getByText("Update “Educational feed”")).toBeVisible();
    /* updating a built-in: it stays everyone's */
    await expect(page.getByLabel("Only me")).toBeDisabled();
    await expect(page.locator("#ai_tpl_aud_hint")).toHaveText("A built-in template is for everyone.");
    await page.getByLabel("Save as a new template").check();
    await expect(page.getByLabel("Only me")).toBeEnabled();
    await page.getByLabel("Only me").check();
    await expect(page.locator("#ai_tpl_name")).toHaveValue("");
    await page.locator("#ai_tpl_name").fill("E2E poster template");
    await page.getByRole("button", { name: "Save template" }).click();
    await page.waitForFunction(() => aiPromptTemplates().some(t => t.name === "E2E poster template" && t.owner === ME && t.private === true));
    await expect(page.locator(".ai-template-card", { hasText: "E2E poster template" }).locator(".ai-tpl-own")).toBeVisible();
    const made = await page.evaluate(() => aiPromptTemplates().find(t => t.name === "E2E poster template"));
    expect(made.editorFields.extraLayers.find(l => l.id === "e2epic").src).toMatch(/^\/files\/[a-f0-9]{64}\.png$/);
    expect(made.layout).toBe("poster");
    await expect(page.locator(".ai-template-card", { hasText: "E2E poster template" })).toBeVisible();
    /* a blank canvas, then the template: back exactly as it was */
    await page.locator(".ai-template-card", { hasText: "Blank" }).click();
    await page.locator(".ai-template-card", { hasText: "E2E poster template" }).click();
    expect(await page.evaluate(() => [AIF.headline, AIF.layout, (AIF.extraLayers || []).some(l => l.id === "e2epic")])).toEqual(["Template E2E headline", "poster", true]);
    /* changed on the canvas (its brief too, which used to forget the template) and saved over itself */
    await page.evaluate(() => { AIF.headline = "Updated from the canvas"; aiSetBrief("A changed brief"); renderScreen(false); });
    await save.click();
    await expect(page.getByLabel(/Update/)).toBeChecked();
    await expect(page.getByLabel("Only me")).toBeChecked();   /* its own: still only for its maker, and changeable */
    await expect(page.getByLabel("Only me")).toBeEnabled();
    await expect(page.locator("#ai_tpl_name")).toHaveValue("E2E poster template");
    await page.getByRole("button", { name: "Save template" }).click();
    await page.waitForFunction(id => { const t = aiPromptTemplates().find(x => x.id === id); return t && t.editorFields.headline === "Updated from the canvas" && t.brief === "A changed brief"; }, made.id);
    expect(await page.evaluate(() => aiPromptTemplates().filter(t => t.name === "E2E poster template").length)).toBe(1);
    /* removed from the same dialog */
    await save.click();
    await page.getByRole("button", { name: "Delete template" }).click();
    await page.locator("#modalWrap").getByRole("button", { name: "Delete" }).click();
    await page.waitForFunction(id => !aiPromptTemplates().some(t => t.id === id), made.id);
    await expect(page.locator(".ai-template-card", { hasText: "E2E poster template" })).toHaveCount(0);
    /* a role with neither template permission has no button */
    await page.evaluate(() => { window.__has = has; has = c => c === "save_ai_templates" || c === "save_own_ai_templates" ? false : window.__has(c); renderScreen(false); });
    await expect(page.getByRole("button", { name: "Save as template" })).toHaveCount(0);
    await page.evaluate(() => { has = window.__has; renderScreen(false); });
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(page.getByRole("button", { name: "Simpan sebagai template" })).toBeVisible();
  } finally {
    await page.evaluate(async b => { UI_LANG = "en"; const now = (WS.ai.promptTemplates || []).filter(t => t && t.name === "E2E poster template"); for (const t of now) await apiFetch("DELETE", "/api/ai/templates/" + t.id).catch(() => {}); }, before);
  }
});
