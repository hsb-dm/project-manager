/* A Figma link in a task's description stays one link, however often the description is saved — it used to come
   back as "[]([](https://…" a little longer on every save. A description already filled that way reads as the one
   link, and is stored that way once it is saved. The repair rules: tests/desc-links.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const U = "https://www.figma.com/design/mXJlv7xJ7Wy6bv1vNhL8y8f/Ads-banner?node-id=8571-222&p=f&t=MSMYUAAiVJ7DIZ1V-0";
const TEXT = "Please create voice over video for UAC part Aug - Sept.\n" + U;
const BROKEN = "Please create voice over video for UAC part Aug - Sept.\n[]([]([](" + U + ")[](" + U + ")" + U + ")[](" + U + ")" + U + ")";

test("a link written as its address stays one link through every save", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.route(/^https:\/\/www\.figma\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async text => { const d = await apiFetch("POST", "/api/tasks", { title: "Voice over " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], description: text }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "brief"; renderDrawer(); return d.id; }, TEXT);
  const stored = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => d.description), id);
  const view = page.locator("#drawer .md-view").first();
  try {
    await expect(view.locator('a[href="' + U + '"]')).toHaveCount(1);
    await expect(view).not.toContainText("[](");
    /* edited and saved again and again — on every pause in typing, and on Done */
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
      await expect(page.locator("#descSrc")).toBeVisible();
      await page.evaluate(() => { descSaveNow(); S.descMode = "viewer"; renderDrawer(); });
      await expect.poll(stored).not.toContain("[](");
    }
    expect(await stored()).toBe(TEXT);
    await expect(view.locator('a[href="' + U + '"]')).toHaveCount(1);
    /* one already filled with "[](": reads as the one link, and is stored that way once saved */
    await page.evaluate(async o => { const d = await apiFetch("GET", "/api/tasks/" + o.id); d.description = o.broken; await apiFetch("PUT", "/api/tasks/" + o.id, d); await reloadAll(); openTask(o.id); S.drawerTab = "brief"; S.descMode = "viewer"; renderDrawer(); }, { id, broken: BROKEN });
    await expect(view).not.toContainText("[](");
    await expect(view.locator('a[href="' + U + '"]')).toHaveCount(1);
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
    await page.evaluate(() => { descSaveNow(); S.descMode = "viewer"; renderDrawer(); });
    await expect.poll(stored).toBe(TEXT);
    /* a link whose words are another address keeps its words and where it goes */
    const OTHER = "See [https://a.example/brief](https://b.example/final)";
    await page.evaluate(async o => { const d = await apiFetch("GET", "/api/tasks/" + o.id); d.description = o.text; await apiFetch("PUT", "/api/tasks/" + o.id, d); await reloadAll(); openTask(o.id); S.drawerTab = "brief"; S.descMode = "viewer"; renderDrawer(); }, { id, text: OTHER });
    await expect(view.locator("a")).toHaveCount(1);
    await expect(view.locator('a[href="https://b.example/final"]')).toHaveText("https://a.example/brief");
    for (let i = 0; i < 2; i++) await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); descSaveNow(); S.descMode = "viewer"; renderDrawer(); });
    await expect.poll(stored).toBe(OTHER);
  } finally {
    await page.evaluate(async i => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});
