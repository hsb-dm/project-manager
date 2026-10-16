/* AI Hub's preview, shrunk properly (Oct 2026). A design is drawn at full size; shown about six times smaller, the
   browser sampled it roughly and fine detail turned to noise ("burik"). A copy drawn at the shown size now lies over
   it: a fine black-and-white checkerboard comes out an even grey instead of noise. The full-size canvas still takes
   every click; zoomed in close, there is no copy; the download is the full-size design. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the preview is the design shrunk properly, and the canvas under it still answers", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const was = await page.evaluate(() => JSON.stringify(AIF));
  try {
    /* a story with a picture of pixel-fine detail over its whole width */
    await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1080; c.height = 1920; const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, 1080, 1920); g.fillStyle = "#000";
      for (let y = 0; y < 1920; y++) for (let x = (y % 2); x < 1080; x += 2) g.fillRect(x, y, 1, 1);
      go("aihub"); AIF.size = "story"; AIF.layout = "poster"; AIF.headline = "Asuransi Perlindungan Dana Nasabah"; AIF.sub = ""; AIF.badge = ""; AIF.cta = ""; AIF.disclaimer = false; AIF.extraLayers = [];
      AIF.extraLayers.push({ id: "chk", type: "image", name: "Checker", src: c.toDataURL("image/png"), aspectLock: true, x: 50, y: 50, w: 100 });
      AIF.layerOrder = ["extra_chk"].concat(aiLayerIds().filter(id => id !== "extra_chk")); AIF.selectedLayer = "canvas"; renderScreen(false);
    });
    const view = page.locator("#aiCanvas canvas.ai-view-canvas");
    await expect(view).toHaveCount(1);
    const m = await page.evaluate(() => { const v = document.querySelector("#aiCanvas canvas.ai-view-canvas"), r = v.getBoundingClientRect(); return { bw: v.width, bh: v.height, w: Math.round(r.width * devicePixelRatio), h: Math.round(r.height * devicePixelRatio), pe: getComputedStyle(v).pointerEvents }; });
    expect([m.bw, m.bh]).toEqual([m.w, m.h]);
    expect(m.pe, "clicks go to the canvas under it").toBe("none");
    /* the checkerboard: an even grey, not noise */
    await expect.poll(() => page.evaluate(() => {
      const v = document.querySelector("#aiCanvas canvas.ai-view-canvas"), d = v.getContext("2d").getImageData(Math.round(v.width * .1), Math.round(v.height * .45), Math.round(v.width * .8), Math.round(v.height * .1)).data;
      let n = 0, s = 0, s2 = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; n++; s += l; s2 += l * l; }
      const mean = s / n; return { mean: Math.round(mean), spread: Math.round(Math.sqrt(s2 / n - mean * mean)) };
    }), { timeout: 8000 }).toMatchObject({ spread: expect.any(Number) });
    const q = await page.evaluate(() => { const v = document.querySelector("#aiCanvas canvas.ai-view-canvas"), d = v.getContext("2d").getImageData(Math.round(v.width * .1), Math.round(v.height * .45), Math.round(v.width * .8), Math.round(v.height * .1)).data;
      let n = 0, s = 0, s2 = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; n++; s += l; s2 += l * l; } const mean = s / n; return { mean: Math.round(mean), spread: Math.round(Math.sqrt(s2 / n - mean * mean)) }; });
    expect(q.mean).toBeGreaterThan(100); expect(q.mean).toBeLessThan(160);
    expect(q.spread, "averaged, not sampled").toBeLessThan(20);
    /* a click on the headline, through the copy, still picks it */
    const hit = await page.evaluate(() => { const h = AI_LAYER_HITS.find(x => x.id === "headline"), cv = document.querySelector("#aiCanvas canvas:not(.ai-view-canvas)"), r = cv.getBoundingClientRect(); return { x: r.left + (h.x + h.w / 2) * r.width / cv.width, y: r.top + (h.y + h.h / 2) * r.height / cv.height }; });
    await page.mouse.click(hit.x, hit.y);
    await page.waitForFunction(() => AIF.selectedLayer === "headline");
    /* zoomed in to 100%: the canvas itself, no copy; back to Fit: the copy again */
    await page.evaluate(() => aiViewZoom(100));
    await expect(view).toHaveCount(0);
    await page.evaluate(() => aiViewZoom("fit"));
    await expect(view).toHaveCount(1);
    /* the download is the full-size design */
    expect(await page.evaluate(() => new Promise(res => aiCompose(cv => res([cv.width, cv.height]), true)))).toEqual([1080, 1920]);
  } finally {
    await page.evaluate(w => { AIF = Object.assign(AIF, JSON.parse(w)); renderScreen(false); }, was);
  }
});
