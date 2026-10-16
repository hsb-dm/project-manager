/* The canvas's layout, sent with a generation (Oct 2026). While "Keep AI image outside text areas" is on, AI Hub
   sends a layout map with the generation: the poster at its proportions, black where the headline and the other
   text sit, lighter where the picture may be busy. Off, it is not sent. How each provider uses it:
   tests/ai-poster-look.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("a generation carries the canvas's layout: dark where the text is, lighter where the picture may be", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const was = await page.evaluate(() => JSON.stringify(AIF));
  let sent = null;
  await page.route("**/api/ai/image", route => { sent = route.request().postDataJSON(); route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "stopped by the test" }) }); });
  try {
    await page.evaluate(() => { go("aihub"); AIF.size = "story"; AIF.layout = "poster"; AIF.headline = "Asuransi Perlindungan Dana Nasabah"; AIF.sub = "Tanpa Biaya Tambahan"; AIF.badge = "Telah hadir"; AIF.disclaimer = true; AIF.protectText = true; AIF.brief = "A steel safe wrapped by a glossy lime shield on a round podium"; renderScreen(false); });
    await page.waitForFunction(() => (AI_LAYER_HITS || []).some(h => h.id === "headline"));
    await page.evaluate(() => aiGenerate());
    await expect.poll(() => sent).not.toBeNull();
    expect(sent.layoutMap).toMatch(/^data:image\/png;base64,/);
    /* read back: the poster's proportions, black over the headline, lighter in the middle of the free area */
    const m = await page.evaluate(url => new Promise(res => { const im = new Image(); im.onload = () => {
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const sz = aiActiveSize(), k = im.width / sz.w, lum = (x, y) => { const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return (d[0] + d[1] + d[2]) / 3; };
      const hs = AI_LAYER_HITS.filter(h => /^(headline|sub|cta|badge|disclaimer|logo)$/.test(h.id)), head = hs.find(h => h.id === "headline");
      /* the free point farthest from every text box, down the middle */
      let best = null; for (let y = 0; y < sz.h; y += sz.h / 40) { const d = Math.min.apply(null, hs.map(h => Math.max(0, Math.abs(y - (h.y + h.h / 2)) - h.h / 2))); if (!best || d > best.d) best = { y, d }; }
      res({ ratio: +(im.width / im.height).toFixed(2), want: +(sz.w / sz.h).toFixed(2), maxSide: Math.max(im.width, im.height), head: lum(head.x + head.w / 2, head.y + head.h / 2), free: lum(sz.w / 2, best.y) });
    }; im.src = url; }), sent.layoutMap);
    expect(m.ratio).toBe(m.want);
    expect(m.maxSide).toBeLessThanOrEqual(768);
    expect(m.head, "the headline's place is dark").toBeLessThan(30);
    expect(m.free, "the free area is lighter").toBeGreaterThan(90);
    /* turned off: the text areas are not protected, and no map goes */
    sent = null;
    await page.evaluate(() => { AIF.protectText = false; aiGenerate(); });
    await expect.poll(() => sent).not.toBeNull();
    expect(sent.layoutMap).toBeUndefined();
  } finally {
    await page.unroute("**/api/ai/image");
    await page.evaluate(w => { AIF = Object.assign(AIF, JSON.parse(w)); renderScreen(false); }, was);
  }
});
