/* Generative Expand, checked before it reaches the canvas (Oct 2026). The expanded picture is shown first: Discard
   leaves the canvas as it was, Generate again asks once more, Adjust or crop opens the frame on that picture, Use this
   puts it on the canvas — at the picture's own size, filling it, even when the provider answered in a size of its own
   (that used to leave part of it off the canvas, which looked like a crop). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("an expanded picture is checked first, then used at its own size, adjusted, regenerated or discarded", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  /* pictures: the one on the canvas, and what the "provider" answers — 1024×1536, not the size asked for */
  const pics = await page.evaluate(() => { const make = (w, h, c) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, w, h); return cv.toDataURL("image/png"); }; return { src: make(600, 400, "#2a6"), a: make(1024, 1536, "#c33"), b: make(1024, 1536, "#33c") }; });
  let calls = 0;
  await page.route("**/api/ai/expand", route => { calls++; route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ imageUrl: calls % 2 ? pics.a : pics.b }) }); });
  const was = await page.evaluate(src => { const w = JSON.stringify({ aif: AIF, image: WS.ai.image });
    WS.ai.image = Object.assign({}, WS.ai.image, { endpoint: "https://api.openai.com/v1/images/generations" });
    go("aihub"); AIF.size = "web_hero"; AIF.extraLayers = [{ id: "gen1", type: "image", name: "Generated image 1", src, generated: true, aspectLock: true, x: 30, y: 40, w: 60 }];
    AIF.layerOrder = ["extra_gen1"].concat(aiLayerIds().filter(id => id !== "extra_gen1")); AIF.selectedLayer = "extra_gen1"; renderScreen(false); return w; }, pics.src);
  const modal = page.locator("#modal");
  const expandRight = async () => { await page.evaluate(() => aiExpandOpen()); await expect(modal).toContainText("Crop & expand canvas"); await page.evaluate(() => aiExpandSetSide("right", 300)); await page.locator("#aiExpandGo").click(); };
  try {
    /* checked first: the canvas is untouched */
    await expandRight();
    await expect(modal).toContainText("Check the expanded picture");
    await expect(modal).toContainText("Result: 1024 × 1536 (asked for 900 × 400)");
    expect(await page.evaluate(() => AIF.size)).toBe("web_hero");
    expect(await page.evaluate(src => AIF.extraLayers[0].src === src, pics.src)).toBe(true);
    /* Discard: as it was */
    await page.locator("#modal").getByRole("button", { name: "Discard" }).click();
    await expect(page.locator("#modalWrap.open")).toHaveCount(0);
    expect(await page.evaluate(src => [AIF.size, AIF.extraLayers[0].src === src], pics.src)).toEqual(["web_hero", true]);
    /* Adjust or crop, while the canvas still holds the 600×400 picture: the frame opens on the expanded one;
       a crop is applied as seen */
    await expandRight();
    await page.locator("#aiExpandAdjust").click();
    await expect(modal).toContainText("Crop & expand canvas");
    expect(await page.evaluate(() => [AI_EXPAND.baseW, AI_EXPAND.baseH])).toEqual([1024, 1536]);
    await page.evaluate(() => aiExpandSetSide("top", -136));
    await expect(page.locator("#aiExpandGo")).toContainText("Apply crop");
    await page.locator("#aiExpandGo").click();
    await expect.poll(() => page.evaluate(() => [AIF.size, AIF.customW, AIF.customH])).toEqual(["custom", 1024, 1400]);
    /* Generate again: asked once more, checked again */
    await expandRight();
    await page.locator("#aiExpandAgain").click();
    await expect.poll(() => calls).toBe(4);
    await expect(page.locator("#aiExpandResult")).toHaveAttribute("src", pics.b);
    await expect(modal).toContainText("Result: 1024 × 1536 (asked for 1324 × 1400)");
    /* Use this: the canvas takes the picture's own size, and the layer fills it */
    await page.locator("#aiExpandUse").click();
    await expect.poll(() => page.evaluate(() => [AIF.size, AIF.customW, AIF.customH])).toEqual(["custom", 1024, 1536]);
    expect(await page.evaluate(() => { const x = AIF.extraLayers[0]; return [x.w, x.x, x.y, x.aspectLock]; })).toEqual([100, 50, 50, true]);
    expect(await page.evaluate(() => [AI_RUNS[0].w, AI_RUNS[0].h])).toEqual([1024, 1536]);
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; aiExpandOpen(); }); await expect(modal).toContainText("Potong & perluas kanvas");
    await page.evaluate(() => aiExpandSetSide("right", 300)); await page.locator("#aiExpandGo").click();
    await expect(modal).toContainText("Cek gambar hasil expand");
    await expect(page.locator("#aiExpandUse")).toHaveText("Pakai ini");
  } finally {
    await page.unroute("**/api/ai/expand");
    await page.evaluate(w => { const o = JSON.parse(w); UI_LANG = "en"; closeModal(); AI_EXPAND = null; AIF = Object.assign(AIF, o.aif); WS.ai.image = o.image; renderScreen(false); }, was);
  }
});
