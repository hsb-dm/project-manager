/* The canvas's layout, sent with a generation (Oct 2026). While "Keep AI image outside text areas" is on, AI Hub sends
   where the headline and the other text sit — boxes in fractions of the poster, never a picture (a grey map once went
   as a picture and came back edited into grey noise) — and the server writes them into the prompt as measured bands.
   Off, nothing is sent. The words and how each provider gets them: tests/ai-poster-look.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("a generation carries where the canvas's text sits, as boxes and never as a picture", async ({ page }) => {
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
    expect(sent.layoutMap, "no picture of the layout").toBeUndefined();
    expect(JSON.stringify(sent)).not.toMatch(/data:image\/png;base64/);
    /* each box where its layer is on the canvas, in fractions of the poster */
    const want = await page.evaluate(() => { const sz = aiActiveSize(), h = AI_LAYER_HITS.find(x => x.id === "headline"); return { x: h.x / sz.w, y: h.y / sz.h, w: h.w / sz.w, h: h.h / sz.h }; });
    const head = sent.layoutZones.find(z => z.kind === "headline");
    expect(head, "the headline's box").toBeTruthy();
    for (const k of ["x", "y", "w", "h"]) expect(Math.abs(head[k] - Math.max(0, Math.min(1, want[k])))).toBeLessThan(0.01);
    expect(sent.layoutZones.length).toBeGreaterThan(1);
    for (const z of sent.layoutZones) { for (const k of ["x", "y", "w", "h"]) { expect(z[k]).toBeGreaterThanOrEqual(0); expect(z[k]).toBeLessThanOrEqual(1); } expect(z.x + z.w).toBeLessThanOrEqual(1.001); expect(z.y + z.h).toBeLessThanOrEqual(1.001); }
    /* turned off: the text areas are not protected, and nothing goes */
    sent = null;
    await page.evaluate(() => { AIF.protectText = false; aiGenerate(); });
    await expect.poll(() => sent).not.toBeNull();
    expect(sent.layoutZones).toBeUndefined();
  } finally {
    await page.unroute("**/api/ai/image");
    await page.evaluate(w => { AIF = Object.assign(AIF, JSON.parse(w)); renderScreen(false); }, was);
  }
});
