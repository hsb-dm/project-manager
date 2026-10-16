/* Brand fonts (Oct 2026): an admin uploads a font file in Settings → AI → Providers; it is stored on the server, the
   browser loads it, and it is in AI Hub's font lists and the template editor, drawing the headline on the canvas.
   The font file used here is the Codicon TTF that ships with Playwright (CC BY 4.0), read at run time. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
function codicon() { const dir = path.join(__dirname, "..", "node_modules", "playwright-core", "lib", "vite", "traceViewer"); const f = fs.readdirSync(dir).find(n => /^codicon.*\.ttf$/.test(n)); return path.join(dir, f); }

test("an uploaded font is stored, loaded and drawn, and listed wherever a font is chosen", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const before = await page.evaluate(() => JSON.parse(JSON.stringify((WS.ai && WS.ai.fonts) || null)));
  try {
    await page.evaluate(() => { S.settingsTab = "ai"; S.aiSettingsSection = "providers"; go("settings"); });
    const sec = page.locator("section.panel", { has: page.getByRole("heading", { name: "Brand fonts" }) });
    await expect(sec).toContainText("No brand fonts yet.");
    /* not a font: refused before anything is sent */
    let chooser = page.waitForEvent("filechooser"); await sec.getByRole("button", { name: "Upload font" }).click();
    await (await chooser).setFiles(path.join(__dirname, "fixtures", "red.png"));
    await expect(page.locator(".toast", { hasText: "not a TTF, OTF, WOFF or WOFF2 font" }).first()).toBeVisible();
    /* a TTF */
    const file = codicon(), name = path.basename(file).replace(/\.ttf$/, "").replace(/[-_.]+/g, " ").trim();
    chooser = page.waitForEvent("filechooser"); await sec.getByRole("button", { name: "Upload font" }).click();
    await (await chooser).setFiles(file);
    await page.waitForFunction(() => { const f = (WS.ai.fonts || [])[0]; return f && /^\/files\/[a-f0-9]{64}\.ttf$/.test(f.url); });
    const font = await page.evaluate(() => WS.ai.fonts[0]);
    expect(font.name.toLowerCase()).toContain(name.split(" ")[0].toLowerCase());
    await expect(sec.locator(".ai-font-row input")).toHaveValue(font.name);
    await expect(sec.locator(".ai-font-row .badge")).toHaveText("TTF");
    /* the browser has it, under its own name, for any weight */
    await page.waitForFunction(n => document.fonts.check('700 20px "' + n + '"') && [...document.fonts].some(f => f.family.replace(/"/g, "") === n && f.status === "loaded"), font.name);
    /* in the template editor */
    await page.evaluate(() => promptTplModal("p_feed_edu"));
    /* a family first, then its style (src/font-families.js): the font is a family, its file a style */
    const family = await page.evaluate(n => fontFaceParts(n).family, font.name);
    await expect(page.locator("#modal .fp-family").first().locator("option", { hasText: family })).toHaveCount(1);
    await page.evaluate(() => closeModal());
    /* in AI Hub: the headline drawn in it */
    await page.evaluate(() => go("aihub"));
    await page.locator(".ai-template-card", { hasText: "Educational feed" }).click();
    expect(await page.evaluate(() => aiWorkspaceFonts())).toContain(font.name);
    await page.evaluate(n => { AIF.headlineFont = n; aiPreview(); }, font.name);
    await page.waitForFunction(n => AI_TEXT_SPECS.headline && AI_TEXT_SPECS.headline.font === n, font.name);
    /* renamed: the open design follows */
    await page.evaluate(() => { S.settingsTab = "ai"; S.aiSettingsSection = "providers"; go("settings"); });
    await sec.locator(".ai-font-row input").fill("Brand Icons E2E"); await sec.locator(".ai-font-row input").blur();
    await page.waitForFunction(() => WS.ai.fonts[0].name === "Brand Icons E2E" && AIF.headlineFont === "Brand Icons E2E");
    await page.waitForFunction(() => document.fonts.check('700 20px "Brand Icons E2E"'));
  } finally {
    await page.evaluate(async b => { WS.ai.fonts = b; AIF.headlineFont = ""; await persistWS(); if (typeof aiFontsLoad === "function") aiFontsLoad(); }, before);
  }
});
