/* AI Hub's Create visual / Generating… button (Oct 2026) took white words and a white spinner whatever the theme, so on
   a light accent (the lime of a dark brand theme) it read white on lime while every other primary button read dark.
   It now takes the theme's ink for its accent, idle, busy and hovered, like the rest. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("the Generate button's words and spinner take the theme's ink, idle and while generating", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const was = await page.evaluate(() => JSON.stringify(WS.theme || {}));
  try {
    await page.evaluate(() => { WS.theme = Object.assign({}, WS.theme, { accent: "#C6F24E", appearance: "dark" }); applyTheme(); go("aihub"); });
    const btn = page.locator(".ai-head-action.generate");
    await expect(btn).toBeVisible();
    const look = () => page.evaluate(() => { const b = document.querySelector(".ai-head-action.generate"), sp = b.querySelector(".ai-button-spinner"), probe = document.createElement("i");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--color-primary-ink"); document.body.appendChild(probe); const ink = getComputedStyle(probe).color; probe.remove();
      return { ink, text: getComputedStyle(b).color, spin: sp ? getComputedStyle(sp).borderTopColor : null, download: (Array.from(document.querySelectorAll(".btn.primary")).find(x => /Download/.test(x.textContent)) || {}).nodeType ? getComputedStyle(Array.from(document.querySelectorAll(".btn.primary")).find(x => /Download/.test(x.textContent))).color : null }; });
    let l = await look();
    expect(l.ink, "a light accent takes dark ink").not.toBe("rgb(255, 255, 255)");
    expect(l.text).toBe(l.ink);
    if (l.download) expect(l.text, "the same as Download").toBe(l.download);
    await page.evaluate(() => { AI_BUSY = true; renderAIHub(); });
    await expect(btn).toContainText("Generating");
    l = await look();
    expect(l.text, "while generating").toBe(l.ink);
    expect(l.spin, "the spinner too").toBe(l.ink);
    await page.evaluate(() => { AI_BUSY = false; renderAIHub(); });
  } finally {
    await page.evaluate(w => { AI_BUSY = false; WS.theme = JSON.parse(w); applyTheme(); }, was);
  }
});
