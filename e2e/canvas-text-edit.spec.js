/* Editing text on the AI Hub canvas (Oct 2026): the editor is the text itself, at the size it is drawn (zoom and the
   layer's scale included), where it is drawn, in its font and colour, and the canvas leaves that text out while it
   is typed, as in Canva or Figma. It used to open as a bold white box several times bigger than the text. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the text editor on the canvas matches the text it edits", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });   /* room for the canvas at 80% */
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  await page.evaluate(() => go("aihub"));
  await page.locator(".ai-template-card", { hasText: "Weekly market highlight" }).click();
  await page.waitForFunction(() => AI_LAYER_HITS.some(h => h.id === "headline"));
  /* where the canvas draws a layer's text, on screen */
  const open = async id => {
    const at = await page.evaluate(id => { const cv = document.querySelector("#aiCanvas canvas"), r = cv.getBoundingClientRect(), k = r.width / cv.width, h = AI_LAYER_HITS.find(x => x.id === id); return { x: r.left + (h.x + h.w / 2) * k, y: r.top + (h.y + h.h / 2) * k }; }, id);
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.locator(".ai-inline-editor")).toBeVisible();
  };
  const measure = id => page.evaluate(id => {
    const cv = document.querySelector("#aiCanvas canvas"), r = cv.getBoundingClientRect(), k = r.width / cv.width, sp = AI_TEXT_SPECS[id], ed = document.querySelector(".ai-inline-editor"), cs = getComputedStyle(ed), e = ed.getBoundingClientRect();
    const scale = id === "headline" || id === "sub" ? aiLayerScale(id) / 100 : 1;
    return { font: parseFloat(cs.fontSize), want: sp.size * scale * k, family: cs.fontFamily, color: cs.color, align: cs.textAlign, editing: AI_INLINE_EDIT, edLeft: e.left, edTop: e.top, edW: e.width, edH: e.height, canvasLeft: r.left, k, lines: sp.content.split("\n").length, line: sp.lineHeight, hidden: !AI_LAYER_HITS.some(h => h.id === id) };
  }, id);
  /* the headline: lime, centred, its size on screen */
  await open("headline");
  let m = await measure("headline");
  expect(Math.abs(m.font - m.want)).toBeLessThan(0.6);
  expect(m.color).toBe("rgb(212, 250, 0)");
  expect(m.align).toBe("center");
  expect(m.family).toContain("Poppins");
  expect(m.editing).toBe("headline");
  expect(m.hidden).toBe(true);                                       /* the canvas leaves it out while it is typed */
  expect(Math.abs(m.edH - m.lines * m.want * m.line)).toBeLessThan(m.want * 0.6);   /* as many lines, no bigger */
  /* the editor sits on the text: its box holds the drawn lines */
  const drawn = await page.evaluate(() => { const cv = document.querySelector("#aiCanvas canvas"), r = cv.getBoundingClientRect(), k = r.width / cv.width, sp = AI_TEXT_SPECS.headline; return { top: r.top + sp.top * k, mid: r.left + sp.anchorX * k }; });
  expect(Math.abs(m.edTop - drawn.top)).toBeLessThan(3);
  expect(Math.abs(m.edLeft + m.edW / 2 - drawn.mid)).toBeLessThan(3);
  /* typing changes the headline; leaving puts it back on the canvas */
  await page.keyboard.press("Control+A"); await page.keyboard.type("Pasar Minggu Ini");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ai-inline-editor")).toHaveCount(0);
  await page.waitForFunction(() => AIF.headline === "Pasar Minggu Ini" && AI_INLINE_EDIT === null && AI_LAYER_HITS.some(h => h.id === "headline"));
  /* scaled up and zoomed, still the same size as drawn */
  await page.evaluate(() => { AIF.headlineScale = 150; AI_VIEW.zoom = 60; aiPreview(); });
  await page.waitForFunction(() => AI_LAYER_HITS.some(h => h.id === "headline") && Math.abs(document.querySelector("#aiCanvas canvas").getBoundingClientRect().width / document.querySelector("#aiCanvas canvas").width - 0.6) < 0.01);
  await open("headline");
  m = await measure("headline");
  expect(Math.abs(m.font - m.want)).toBeLessThan(0.6);
  expect(m.want).toBeGreaterThan(65);
  await page.keyboard.press("Escape");
  /* the subheadline: its own font and colour */
  await page.evaluate(() => { AIF.headlineScale = 100; AI_VIEW.zoom = 0; aiPreview(); });
  await page.waitForFunction(() => AI_LAYER_HITS.some(h => h.id === "sub"));
  await open("sub");
  m = await measure("sub");
  expect(Math.abs(m.font - m.want)).toBeLessThan(0.6);
  expect(m.color).toBe("rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
});
