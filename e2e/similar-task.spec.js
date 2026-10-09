/* Similar tasks. While a new task's title is written, tasks that read alike are listed under it (another word order,
   a short form, Indonesian or English filler words do not hide them); an unrelated title lists nothing. Create on a
   near-identical title asks first — open the one that exists, or create anyway. Tasks finished more than 60 days ago
   are not compared. createDraft() called directly (the AI chat, a message made into a task) is not stopped. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("similar tasks are shown while writing, and Create on a near copy asks first", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36), title = "Ramadan banner Instagram feed " + tag;
  const ids = [];
  const make = t => page.evaluate(async t => { const d = await apiFetch("POST", "/api/tasks", { title: t, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); return d.id; }, t);
  ids.push(await make(title));
  const typeTitle = async t => { await page.locator(".dr-title").click(); await page.keyboard.press("Control+A"); await page.keyboard.type(t); };
  try {
    /* other word order, a short form, filler words: still found */
    await page.evaluate(() => newTaskModal());
    await typeTitle("Tolong bikin banner IG untuk Ramadan feed " + tag);
    await expect(page.locator("#drHead .sim-box")).toBeVisible();
    await expect(page.locator("#drHead .sim-box")).toContainText(ids[0]);
    /* unrelated: nothing listed */
    await typeTitle("Quarterly budget spreadsheet review");
    await expect(page.locator("#drHead .sim-box")).toHaveCount(0);
    /* a near copy: Create asks first; Create anyway creates it */
    await typeTitle(title);
    await expect(page.locator("#drHead .sim-box")).toContainText(ids[0]);
    await page.locator("#drFoot").getByRole("button", { name: "Create task" }).click();
    await expect(page.locator("#modal")).toContainText("This looks like a task that already exists");
    await expect(page.locator("#modal")).toContainText(ids[0]);
    await page.locator("#simCreateAnyway").click();
    await expect.poll(() => page.evaluate(t => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.filter(x => x.title === t).map(x => x.id)), title)).toHaveLength(2);
    ids.push(...(await page.evaluate(t => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.filter(x => x.title === t).map(x => x.id)), title)).filter(i => !ids.includes(i)));
    await page.evaluate(() => { if (S.drawerTask) closeDrawer(); });
    /* "Open" from the question goes to the one that exists */
    await page.evaluate(() => newTaskModal()); await typeTitle(title);
    await page.locator("#drFoot").getByRole("button", { name: "Create task" }).click();
    await page.locator("#modal").getByRole("button", { name: "Open " + ids[0] }).click();
    expect(await page.evaluate(() => S.drawerTask)).toBe(ids[0]);
    await expect.poll(() => page.evaluate(t => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.filter(x => x.title === t && x.meta && x.meta.draft).map(x => x.id)), title)).toHaveLength(1);
    ids.push(...(await page.evaluate(t => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.filter(x => x.title === t && x.meta && x.meta.draft).map(x => x.id)), title)));
    await page.evaluate(() => closeDrawer());
    /* a task finished long ago is not compared; one finished lately is */
    const pool = await page.evaluate(id => { const t = task(id), done = WS.workflow.find(s => s.kind === "closed"), was = [t.status, t.updatedAt]; t.status = done.id; t.updatedAt = new Date(Date.now() - 90 * 864e5).toISOString(); const old = simPool().includes(t); t.updatedAt = new Date(Date.now() - 10 * 864e5).toISOString(); const recent = simPool().includes(t); t.status = was[0]; t.updatedAt = was[1]; return { old, recent }; }, ids[0]);
    expect(pool).toEqual({ old: false, recent: true });
    /* createDraft() called directly is not stopped */
    const before = await page.evaluate(t => TASKS.filter(x => x.title === t).length, title);
    await page.evaluate(t => { newTaskModal({ title: t }); return createDraft(); }, title);
    await expect.poll(() => page.evaluate(t => TASKS.filter(x => x.title === t && !x._draft).length, title)).toBe(before + 1);
    ids.push(...(await page.evaluate(t => TASKS.filter(x => x.title === t && !x._draft).map(x => x.id), title)).filter(i => !ids.includes(i)));
    expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("Similar tasks already exist"), tr("Create anyway")]; UI_LANG = was; return r; })).toEqual(["Sudah ada task yang mirip", "Tetap buat"]);
  } finally {
    await page.evaluate(list => { if (S.drawerTask) closeDrawer(); return Promise.all([...new Set(list)].map(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}))); }, ids);
  }
});
