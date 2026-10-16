/* A font, then its style (Oct 2026). In AI Hub's Properties the Font is a family — the brand fonts' files grouped
   by the family their names say, then the workspace's Google fonts — and Style is one of its files, or one of the
   weights Google has for it. What the design keeps is the font's name and the weight; the canvas draws with them,
   and a template keeps them too. The template editor offers the same two choices. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const FILE = "/files/" + "a".repeat(64) + ".ttf";
/* Google, as far as the test goes: Poppins has Light, Regular, SemiBold and Bold */
const POPPINS = [300, 400, 600, 700].map(w => "@font-face{font-family:'Poppins';font-style:normal;font-weight:" + w + ";src:local('Poppins Fake " + w + "');}").join("\n");

test("Font is a family, Style its files or weights; the design and a template keep both", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\/fonts\.googleapis\.com\/css\?/, r => r.fulfill({ status: 200, contentType: "text/css", body: /family=Poppins/.test(r.request().url()) ? POPPINS : "" }));
  await page.route(/^https:\/\/fonts\.googleapis\.com\/css2\?/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const was = await page.evaluate(f => {
    const w = JSON.stringify({ fonts: (WS.ai && WS.ai.fonts) || [], aif: AIF });
    WS.ai = WS.ai || {}; WS.ai.fonts = ["Stolzl Bold", "Stolzl Regular", "Stolzl Light", "Stolzl Book", "Gilroy Black Italic", "Gilroy Black"].map((name, i) => ({ id: "f" + i, name, url: f }));
    go("aihub"); AIF.headline = "Testimoni nasabah"; AIF.headlineFont = ""; AIF.headlineWeight = null; aiSelectLayer("headline"); renderScreen(false); return w;
  }, FILE);
  const family = page.locator(".ai-props .fp-family").first(), style = page.locator(".ai-props .fp-style").first();
  const styles = () => style.locator("option").allTextContents();
  try {
    /* the brand fonts as families, then the workspace's */
    await expect(family).toBeVisible();
    expect(await family.locator('optgroup[label="Brand fonts"] option').allTextContents()).toEqual(["Stolzl", "Gilroy"]);
    expect(await family.locator('optgroup[label="Fonts"] option').allTextContents()).toContain("Poppins");
    /* Stolzl: its files, lightest first; the headline was Bold, so Bold it stays */
    await family.selectOption({ label: "Stolzl" });
    await expect.poll(styles).toEqual(["Light", "Book", "Regular", "Bold"]);
    await expect.poll(() => page.evaluate(() => [AIF.headlineFont, AIF.headlineWeight])).toEqual(["Stolzl Bold", 700]);
    await page.locator(".ai-props .fp-style").first().selectOption({ label: "Light" });
    await expect.poll(() => page.evaluate(() => [AIF.headlineFont, AIF.headlineWeight])).toEqual(["Stolzl Light", 300]);
    /* Poppins: the weights Google has; Light carries over */
    await page.locator(".ai-props .fp-family").first().selectOption({ label: "Poppins" });
    await expect.poll(() => page.locator(".ai-props .fp-style").first().locator("option").allTextContents()).toEqual(["Light", "Regular", "SemiBold", "Bold"]);
    await expect.poll(() => page.evaluate(() => [AIF.headlineFont, AIF.headlineWeight])).toEqual(["Poppins", 300]);
    await page.locator(".ai-props .fp-style").first().selectOption({ label: "SemiBold" });
    await expect.poll(() => page.evaluate(() => AI_TEXT_SPECS.headline && [AI_TEXT_SPECS.headline.font, AI_TEXT_SPECS.headline.weight])).toEqual(["Poppins", 600]);
    /* a template keeps the font and its weight, and gives them back */
    const tpl = await page.evaluate(() => { const t = aiTemplateFromCanvas("Weights"); return [t.headlineFont, t.headlineWeight]; });
    expect(tpl).toEqual(["Poppins", 600]);
    expect(await page.evaluate(() => { AIF.headlineWeight = null; aiTemplateLook({ headlineFont: "Stolzl Book", headlineWeight: 350 }); return [AIF.headlineFont, AIF.headlineWeight]; })).toEqual(["Stolzl Book", 350]);
    /* a text layer: Style is its weight — there is no separate Weight list */
    const xid = await page.evaluate(() => { aiAddTextLayer(); const x = AIF.extraLayers[AIF.extraLayers.length - 1]; aiSelectLayer("extra_" + x.id); renderScreen(false); return x.id; });
    await expect(page.locator(".ai-props .fp-family").first()).toBeVisible();
    await expect(page.locator(".ai-props .ai-prop-row", { hasText: /^Weight/ })).toHaveCount(0);
    await page.locator(".ai-props .fp-family").first().selectOption({ label: "Gilroy" });
    await page.locator(".ai-props .fp-style").first().selectOption({ label: "Black Italic" });
    await expect.poll(() => page.evaluate(i => (AIF.extraLayers.find(x => x.id === i) || {}).font, xid)).toBe("Gilroy Black Italic");
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(page.locator(".ai-props .ai-prop-label", { hasText: "Gaya" }).first()).toBeVisible();
    await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
    /* the template editor: the same two choices, read on Save */
    await page.evaluate(() => { go("settings", "ai"); const t = aiPromptTemplates()[0]; promptTplModal(t.id); });
    await expect(page.locator("#modal .fp-family")).toHaveCount(2);
    await page.locator("#modal .fp-family").first().selectOption({ label: "Stolzl" });
    await page.locator("#modal .fp-style").first().selectOption({ label: "Book" });
    expect(await page.evaluate(() => [val("pt_head_font"), val("pt_head_weight")])).toEqual(["Stolzl Book", "350"]);
  } finally {
    await page.evaluate(w => { const o = JSON.parse(w); UI_LANG = "en"; closeModal(); WS.ai.fonts = o.fonts; AIF = Object.assign(AIF, o.aif); AIF.extraLayers = o.aif.extraLayers || []; AIF.headlineWeight = o.aif.headlineWeight; }, was);
  }
});
