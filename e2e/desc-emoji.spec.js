/* An emoji pasted as a picture is the emoji itself in a task's description (Oct 2026): pasted, it stays on its line;
   one stored as a picture before reads as the emoji, on the line of its words, and is stored that way once saved; a
   real picture stays a picture. Rules: tests/desc-emoji.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const NOTO = "https://fonts.gstatic.com/s/e/notoemoji/15.0/2705/72.png";
const BANG = "https://fonts.gstatic.com/s/e/notoemoji/15.0/2757/72.png";
const STORED = "Slide 5\n![✅](" + NOTO + ")\nBisa ambil posisi Buy atau Sell\n![❗](" + BANG + ")\n\nTrading tetap punya risiko.";

test("emoji pictures read and save as emoji; a real picture stays a picture", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  /* the emoji host, as a 72×72 picture — what made them large */
  await page.route(/^https:\/\/(fonts\.gstatic\.com|example\.org)\//, async r => { const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAIAAADajyQQAAAAPklEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwYTs0AAcm6V/sAAAAASUVORK5CYII=", "base64"); await r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async text => { const d = await apiFetch("POST", "/api/tasks", { title: "Slides " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], description: text }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "brief"; S.descMode = "viewer"; renderDrawer(); return d.id; }, STORED);
  const stored = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => d.description), id);
  const view = page.locator("#drawer .md-view").first();
  try {
    /* stored before: the emoji, on the line of its words, no picture */
    await expect(view).toContainText("✅ Bisa ambil posisi Buy atau Sell");
    await expect(view.locator("img.desc-img")).toHaveCount(0);
    /* saved once: stored that way */
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); descSaveNow(); S.descMode = "viewer"; renderDrawer(); });
    await expect.poll(stored).toBe("Slide 5\n✅ Bisa ambil posisi Buy atau Sell\n❗\n\nTrading tetap punya risiko.");
    /* pasted from a page that puts emoji as pictures: the emoji, in its place */
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
    await page.evaluate(src => {
      const el = document.getElementById("descSrc"); el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      const dt = new DataTransfer(); dt.setData("text/html", '<div><img class="emoji" alt="✅" src="' + src + '" width="72" height="72"> Pilihan instrumennya beragam</div>'); dt.setData("text/plain", "✅ Pilihan instrumennya beragam");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, NOTO);
    await expect(page.locator("#descSrc img")).toHaveCount(0);
    await expect(page.locator("#descSrc")).toContainText("✅ Pilihan instrumennya beragam");
    await page.evaluate(() => { descSaveNow(); S.descMode = "viewer"; renderDrawer(); });
    await expect.poll(stored).toContain("✅ Pilihan instrumennya beragam");
    expect(await stored()).not.toContain("![");
    /* a real picture stays a picture */
    await page.evaluate(async i => { const d = await apiFetch("GET", "/api/tasks/" + i); d.description = "Moodboard\n![Hero banner](https://example.org/hero.png)"; await apiFetch("PUT", "/api/tasks/" + i, d); await reloadAll(); openTask(i); S.drawerTab = "brief"; S.descMode = "viewer"; renderDrawer(); }, id);
    await expect(view.locator("img.desc-img")).toHaveCount(1);
  } finally {
    await page.evaluate(async i => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});
