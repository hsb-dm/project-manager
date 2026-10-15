/* AI Hub fits the screen (Oct 2026): on a laptop or desktop the page stays still and each panel scrolls inside itself,
   so a wheel over Creative setup moves only Creative setup; the canvas fits its panel; the setup's sections fold and
   stay as they were left; "not connected" is a chip in the header; the generation history is a strip under the
   canvas. A narrow window keeps the page that scrolls. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const PNG = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "fixtures", "red.png")).toString("base64");
const state = page => page.evaluate(() => { const a = appScrollEl(), s = document.querySelector(".ai-setup"), cvs = document.querySelector("#aiCanvas canvas"); return { page: a.scrollHeight - a.clientHeight, pageTop: a.scrollTop, setupTop: s.scrollTop, setupRoom: s.scrollHeight - s.clientHeight, canvasH: Math.round(cvs.getBoundingClientRect().height), viewH: document.getElementById("aiCanvas").clientHeight }; });

test("AI Hub fits the screen and each panel scrolls on its own", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const runs = await page.evaluate(() => JSON.stringify(AI_RUNS));
  try {
    await page.evaluate(() => go("aihub"));
    await page.locator(".ai-template-card", { hasText: "Educational feed" }).click();
    await page.waitForFunction(() => document.querySelector("#aiCanvas canvas"));
    let s = await state(page);
    expect(s.page).toBeLessThanOrEqual(1);                  /* nothing to scroll on the page */
    expect(s.setupRoom).toBeGreaterThan(100);              /* the setup has more than fits, inside itself */
    expect(s.canvasH).toBeLessThanOrEqual(s.viewH);         /* the canvas fits its panel */
    /* a wheel over Creative setup moves Creative setup only */
    const box = await page.locator(".ai-setup").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(async () => (await state(page)).setupTop).toBeGreaterThan(100);
    expect((await state(page)).pageTop).toBe(0);
    /* "not connected" is a chip in the header that opens the AI keys */
    await expect(page.locator(".ai-setup-notice")).toHaveCount(0);
    await expect(page.locator(".ai-studio-head .ai-conn-chip")).toBeVisible();
    /* sections fold, and stay folded after a reload */
    await page.locator('.ai-sec[data-sec="template"] > summary').click();
    await expect(page.locator('.ai-sec[data-sec="template"]')).not.toHaveAttribute("open", "");
    await page.reload(); await page.waitForFunction(() => window.ZC_READY === true && API.on);
    await page.evaluate(() => go("aihub"));
    await expect(page.locator('.ai-sec[data-sec="template"]')).not.toHaveAttribute("open", "");
    await expect(page.locator('.ai-sec[data-sec="brief"]')).toHaveAttribute("open", "");
    await page.locator('.ai-sec[data-sec="template"] > summary').click();
    /* the history: one line while empty; thumbnails under the canvas once there are generations */
    await expect(page.locator(".ai-history-strip .ai-hs-empty")).toBeVisible();
    await expect(page.locator(".ai-generation-history")).toHaveCount(0);
    await page.evaluate(png => { AI_RUNS = [{ url: png, prompt: "p", w: 1080, h: 1440, model: "m", at: new Date().toISOString(), headline: "From history", fields: Object.assign(clone(AIF), { headline: "From history" }) }]; renderScreen(false); }, PNG);
    const thumb = page.locator(".ai-history-strip .ai-hs-thumb").first();
    await expect(thumb).toBeVisible();
    await thumb.click();
    await page.waitForFunction(() => AIF.headline === "From history");
    /* a picture the provider no longer keeps: the placeholder, not a broken image */
    await page.route("https://expired.example/**", r => r.fulfill({ status: 404, body: "" }));
    await page.evaluate(() => { AI_RUNS.push({ url: "https://expired.example/gone.png", prompt: "p", w: 1080, h: 1440, model: "m", at: new Date().toISOString(), headline: "Gone" }); renderScreen(false); });
    const gone = page.locator(".ai-history-strip .ai-hs-thumb").nth(1);
    await expect(gone.locator(".ai-history-placeholder")).toBeVisible();
    await expect(gone.locator("img")).toBeHidden();
    expect(await gone.locator(".ai-history-placeholder svg").evaluate(e => [getComputedStyle(e).width, getComputedStyle(e.parentNode).display]), "an image icon, centred").toEqual(["24px", "grid"]);
    /* a generation is taken out of the history with the bin at its bottom right, and Undo puts it back */
    const item = page.locator(".ai-history-strip .ai-hs-item").nth(1), stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("cos.ai.runs." + (WS.id || "ws")) || "[]").map(r => r.headline));
    await item.hover();
    await expect(item.locator(".ai-hs-del")).toBeVisible();
    await item.locator(".ai-hs-del").click();
    await expect(page.locator(".ai-history-strip .ai-hs-item")).toHaveCount(1);
    expect(await stored()).toEqual(["From history"]);
    await page.locator("#toasts .undo-toast", { hasText: "Removed from history" }).getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".ai-history-strip .ai-hs-item")).toHaveCount(2);
    expect(await stored()).toEqual(["From history", "Gone"]);
    /* folded, the strip is one line and the canvas gets the room */
    const before = (await state(page)).viewH;
    await page.locator(".ai-hs-toggle").click();
    await expect(page.locator(".ai-hs-track")).toHaveCount(0);
    await expect.poll(async () => (await state(page)).viewH).toBeGreaterThan(before);
    await page.locator(".ai-hs-toggle").click();
    /* the keyboard shortcuts: a pop-up over the page, not a box pushed into the panel */
    await page.locator('.ai-canvas-toolbar [onclick="aiShortcutHelp()"]').click();
    const help = page.locator("#aiShortcutHelp");
    await expect(help).toBeVisible();
    expect(await help.evaluate(el => [getComputedStyle(el).position, el.parentNode === document.body])).toEqual(["fixed", true]);
    await expect(help).toContainText("Alt + mouse wheel");
    await page.mouse.click(5, 300);                              /* a click outside closes it */
    await expect(help).toHaveCount(0);
    await page.locator('.ai-canvas-toolbar [onclick="aiShortcutHelp()"]').click();
    await help.locator(".ai-shortcut-x").click();
    await expect(help).toHaveCount(0);
    /* a narrow window: the page scrolls, as before */
    await page.setViewportSize({ width: 1000, height: 760 }); await page.waitForTimeout(400);
    expect((await state(page)).page).toBeGreaterThan(200);
  } finally {
    await page.evaluate(r => { AI_RUNS = JSON.parse(r); try { localStorage.removeItem("cos.ai.sections." + ME); } catch (e) {} }, runs);
  }
});
