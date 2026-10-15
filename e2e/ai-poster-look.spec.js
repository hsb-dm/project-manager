/* AI Hub follows the workspace's posters (Oct 2026). The Brand default prompt starts with the poster look; a
   Poster template hangs its headline from the top, puts the subheadline and the button low and the two-line
   disclaimer centred under them; brand characters an admin adds in Settings are chosen by a template with
   people and go with the generation as ids, with the brand prompt left to the server. */
const { test, expect } = require("@playwright/test");
const path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("poster templates, their type and brand characters reach the canvas and the generation", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const before = await page.evaluate(() => JSON.parse(JSON.stringify((WS.ai && WS.ai.characters) || null)));
  try {
    /* Settings → AI → Providers: the brand prompt a workspace starts with, and the characters list */
    await page.evaluate(() => { S.settingsTab = "ai"; S.aiSettingsSection = "providers"; go("settings"); renderScreen(); });
    await expect(page.locator("#ai_i_style")).toHaveValue(/electric-lime glow/);
    const chars = page.locator("section.panel", { has: page.getByRole("heading", { name: "Brand characters" }) });
    await expect(chars).toContainText("No brand characters yet.");
    await chars.getByRole("button", { name: "Add character" }).click();
    const card = chars.locator(".ai-char-admin").first();
    await expect(card).toBeVisible();
    await card.locator("input").first().fill("Rina E2E"); await card.locator("textarea").fill("Indonesian woman, late 20s");
    await card.locator("textarea").blur();
    const chooser = page.waitForEvent("filechooser"); await card.getByRole("button", { name: "Add photo" }).click();
    await (await chooser).setFiles(path.join(__dirname, "fixtures", "red.png"));
    /* the server stores the photo as a file; the page takes its copy */
    await page.waitForFunction(() => { const c = (WS.ai.characters || [])[0]; return c && c.name === "Rina E2E" && /^\/files\/[a-f0-9]{64}\.jpg$/.test((c.photos || [])[0] || ""); });
    await expect(card.locator(".ai-char-photo img")).toHaveCount(1);
    const charId = await page.evaluate(() => WS.ai.characters[0].id);

    /* the template editor shows a template's type */
    await page.evaluate(() => promptTplModal("p_feed_engage"));
    await expect(page.locator("#pt_cta_shape")).toHaveValue("50");
    await expect(page.locator("#pt_cta_stroke")).toBeChecked();
    await expect(page.locator("#pt_align")).toHaveValue("center");
    await expect(page.locator("#pt_disc")).toHaveValue(/BAPPEBTI[\s\S]*\nForex Trading/);
    await expect(page.locator("#pt_people")).toHaveValue("0");
    await page.evaluate(() => closeModal());

    /* AI Hub: the Poster template on a 3:4 feed */
    await page.evaluate(() => go("aihub"));
    await page.locator(".ai-template-card", { hasText: "Comment-to-DM post" }).click();
    await page.waitForFunction(() => AIF.layout === "poster" && AI_LAYER_HITS.some(h => h.id === "disclaimer"));
    const L = await page.evaluate(() => { const sz = aiActiveSize(), h = {}; AI_LAYER_HITS.forEach(x => { h[x.id] = x; }); return { w: sz.w, h: sz.h, head: h.headline, sub: h.sub, cta: h.cta, disc: h.disclaimer, disc1: AI_TEXT_SPECS.disclaimer.content.split("\n")[0], discLines: AI_TEXT_SPECS.disclaimer.content.split("\n").length }; });
    expect([L.w, L.h]).toEqual([1080, 1440]);
    expect(L.head.y + L.head.h).toBeLessThan(L.h * 0.42);                       /* the headline hangs from the top */
    expect(L.sub.y).toBeGreaterThan(L.h * 0.6);                                  /* the subheadline sits low */
    expect(L.cta.y).toBeGreaterThan(L.sub.y);
    expect(L.cta.y + L.cta.h).toBeLessThanOrEqual(L.disc.y);                    /* the button stops above the disclaimer */
    expect(L.discLines).toBe(2);
    expect(L.disc1).toBe("HSB Investasi, Pialang Berjangka Teregulasi BAPPEBTI, OJK, Dan BI.");   /* the template's own line break is kept */
    expect(Math.abs(L.disc.x + L.disc.w / 2 - L.w / 2)).toBeLessThanOrEqual(2);  /* the disclaimer is centred */
    expect(Math.abs(L.head.x + L.head.w / 2 - L.w / 2)).toBeLessThanOrEqual(2);
    /* a long headline low on the page still stops above the disclaimer */
    await page.locator(".ai-template-card", { hasText: "Weekly market highlight" }).click();
    await page.evaluate(() => { AIF.headline = "Market highlight minggu ini dengan judul yang sengaja dibuat sangat panjang sekali supaya turun"; aiPreview(); });
    await page.waitForFunction(() => { const h = {}; AI_LAYER_HITS.forEach(x => { h[x.id] = x; }); return h.headline && h.headline.h > 250 && h.disclaimer; });
    const low = await page.evaluate(() => { const h = {}; AI_LAYER_HITS.forEach(x => { h[x.id] = x; }); return { subBottom: h.sub.y + h.sub.h, discTop: h.disclaimer.y }; });
    expect(low.subBottom).toBeLessThanOrEqual(low.discTop);
    await page.locator(".ai-template-card", { hasText: "Comment-to-DM post" }).click();
    /* this template has no people: the picker shows the character, not chosen */
    const pick = page.locator(".ai-char-card", { hasText: "Rina E2E" });
    await expect(pick).toHaveAttribute("aria-pressed", "false");

    /* the testimonial thumbnail chooses the brand character by itself */
    await page.locator(".ai-template-card", { hasText: "Video thumbnail — people" }).click();
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => [aiActiveSize().w, aiActiveSize().h, AIF.disclaimer])).toEqual([1280, 720, false]);

    /* the generation carries the character as an id and says who it is; the brand prompt is the server's to add */
    let sent = null;
    await page.route("**/api/ai/image", route => { sent = route.request().postDataJSON(); route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "stopped by the test" }) }); });
    await page.evaluate(() => aiGenerate());
    await expect.poll(() => sent).not.toBeNull();
    expect(sent.characters).toEqual([charId]);
    expect(sent.referenceImages).toBeUndefined();
    expect(sent.prompt).toContain("People: the reference photos show Rina E2E (Indonesian woman, late 20s).");
    expect(sent.prompt).not.toContain("Brand requirements");
    expect(sent.prompt).toContain("lime-green linen overshirts");
    await page.unroute("**/api/ai/image");
    /* turned off by hand, nothing goes */
    await pick.click(); await expect(pick).toHaveAttribute("aria-pressed", "false");

    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(); });
    await expect(page.locator(".ai-template-card", { hasText: "Feed ajak komen & DM" })).toBeVisible();
    await expect(page.locator(".ai-chars label")).toHaveText("Karakter brand");
  } finally {
    await page.evaluate(async b => { UI_LANG = "en"; WS.ai.characters = b; await persistWS(); }, before);
  }
});
