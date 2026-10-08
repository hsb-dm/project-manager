/* Dark mode: what is typed in a comment can be read. The comment box shows its text through a mirror layer
   (mentions drawn as chips) under a see-through textarea; dark mode gave every textarea a background, which
   covered that layer, so the text typed stayed invisible (dark on dark). The chat box was already right. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("in dark mode the text typed in a comment shows, light on dark; light mode is as it was", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Dark comment " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(d)); return d.id; });
  /* how readable the typed text is: the textarea must not cover the mirror, and the mirror's text must stand out
     from whatever is behind it (its own background, else the composer's) */
  const look = () => page.evaluate(() => {
    const ta = document.getElementById("cmtText"), m = document.querySelector("#drawer .cmt-ta-mirror"), box = document.querySelector("#drawer .composer");
    const rgb = s => (s.match(/[\d.]+/g) || []).map(Number), alpha = c => c.length > 3 ? c[3] : 1;
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const taBg = rgb(getComputedStyle(ta).backgroundColor), mBg = rgb(getComputedStyle(m).backgroundColor), behind = alpha(mBg) ? mBg : rgb(getComputedStyle(box).backgroundColor), fg = rgb(getComputedStyle(m).color);
    const a = lum(fg), b = lum(behind);
    return { covers: alpha(taBg) > 0, text: m.textContent.replace(/\u200b/g, ""), contrast: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10 };
  });
  try {
    for (const mode of ["dark", "light"]) {
      await page.evaluate(m => setAppearance(m), mode);
      await page.evaluate(i => { window._cmtDraft = ""; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
      await page.locator("#cmtText").click();
      await page.keyboard.type("Looks good to me");
      const l = await look();
      expect(l.covers, mode + ": the textarea does not cover the text").toBe(false);
      expect(l.text, mode).toBe("Looks good to me");
      expect(l.contrast, mode + ": readable").toBeGreaterThan(7);
      await page.evaluate(() => { window._cmtDraft = ""; });
    }
  } finally {
    await page.evaluate(i => { setAppearance("light"); closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.people[ME].prefs || {}).appearance))).toBe("light");
  }
});
