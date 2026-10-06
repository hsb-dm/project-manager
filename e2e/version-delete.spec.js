/* A version made by mistake can be deleted from the version box: only the newest, while nobody has
   decided on it. The file uploaded with it goes too; earlier versions stay. The server's rules are
   tests/version-delete.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("the newest undecided version is deleted with its file; an approved one has no Delete", async ({ page }) => {
  await page.route(/^https:\/\/(drive|docs)\.google\.com\/|^https:\/\/example\.org\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const title = "Version delete " + Date.now().toString(36);
  await page.evaluate(t => { newTaskModal({ title: t, proj: PROJECTS[0] && PROJECTS[0].id, assignee: ME }); createDraft(); }, title);
  await expect.poll(() => page.evaluate(t => TASKS.some(x => x.title === t && !x._draft), title), { timeout: 10000 }).toBe(true);
  const id = await page.evaluate(t => TASKS.find(x => x.title === t).id, title);
  const saved = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
  try {
    /* V1, then V2 by mistake, uploaded with its file */
    await page.evaluate(i => pushVersionFrom(task(i), { url: "https://example.org/v1.png" }, "First"), id);
    await expect.poll(async () => (await saved()).versions.length).toBe(1);
    await page.evaluate(i => editTaskWith(task(i), t => { const v = V(2, ME, 0, "pending", "#1D4ED8", "wrong file"); v.driveUrl = "https://example.org/oops.png"; t.versions.push(v); t.files.push(F("oops.png", "image", "link", "0.1 MB", 0, "https://example.org/oops.png")); }), id);
    await expect.poll(async () => (await saved()).versions.length).toBe(2);

    await page.evaluate(i => { openTask(i); S.drawerTab = "files"; renderDrawer(); }, id);
    const box = page.locator("#drawer .av-version");
    await expect(box.locator(".av-head h3")).toContainText("Version 2");
    await box.locator(".av-ver-del").click();
    await expect(page.locator("#modal")).toContainText("Delete Version 2?");
    await expect(page.locator("#modal")).toContainText("oops.png");
    await page.locator("#modal .btn.danger").click();
    await expect(page.locator(".toast").last()).toContainText("Version 2 deleted");
    await expect(box.locator(".av-head h3")).toContainText("Version 1");
    await expect.poll(async () => { const s = await saved(); return s.versions.map(v => v.n).join() + "|" + s.files.some(f => f.name === "oops.png"); }).toBe("1|false");
    expect((await saved()).activity.some(a => a.k === "version_deleted")).toBe(true);

    /* the next version is V2 again */
    await page.evaluate(i => pushVersionFrom(task(i), { url: "https://example.org/v2.png" }, "Right file"), id);
    await expect.poll(async () => (await saved()).versions.map(v => v.n).join()).toBe("1,2");

    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    await expect(box.locator(".av-ver-del")).toHaveAttribute("title", "Hapus versi");
    await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });

    /* once approved there is nothing to delete */
    await page.evaluate(i => editTaskWith(task(i), t => { t.versions[t.versions.length - 1].state = "approved"; }), id);
    await expect.poll(async () => { const s = await saved(); return s.versions[s.versions.length - 1].state; }).toBe("approved");
    await page.evaluate(() => renderDrawer());
    await expect(box.locator(".av-ver-del")).toHaveCount(0);
  } finally {
    await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id);
  }
});
