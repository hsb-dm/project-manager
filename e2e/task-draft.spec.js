/* A new task closed before it was created is kept as a draft: in the first stage, assigned to no one, marked Draft
   on the board. Opening it says what it is; "Create task" brings back the stage and people chosen while it was
   written. Undo on the toast throws it away; an empty new task, or Discard, keeps nothing. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const serverTask = (page, title) => page.evaluate(t => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.filter(x => x.title === t)), title);

test("closing a new task keeps it as a draft; it is finished or undone", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36), title = "Half-written " + tag;
  const ids = [];
  try {
    /* a new task, put in the second stage, with a title — then closed with the × */
    await page.evaluate(() => newTaskModal({ status: WS.workflow[1].id }));
    await page.locator(".dr-title").click();
    await page.keyboard.type(title);
    const chosen = await page.evaluate(() => ({ status: task("T-new").status, assignees: assigneesOf(task("T-new")), first: WS.workflow[0].id }));
    await page.locator('#drawer .dr-top [title="Close"]').click();
    await expect(page.locator(".toast", { hasText: "Saved as a draft in" })).toBeVisible();
    await expect.poll(async () => (await serverTask(page, title)).length).toBe(1);
    const [d] = await serverTask(page, title); ids.push(d.id);
    expect(d.status).toBe(chosen.first);
    expect(d.assignees).toEqual([]); expect(d.reviewers).toEqual([]);
    expect(d.meta.draft.status).toBe(chosen.status); expect(d.meta.draft.assignees).toEqual(chosen.assignees);
    /* marked on the board */
    await expect.poll(() => page.evaluate(i => !!task(i) && kcard(task(i)).includes("draft-badge"), d.id)).toBe(true);

    /* opened, it says what it is; Create task brings back the stage and the people */
    await page.evaluate(i => openTask(i), d.id);
    await expect(page.locator("#drBody .draft-note")).toBeVisible();
    await expect(page.locator("#drFoot")).toContainText("Delete draft");
    await page.locator("#drFoot").getByRole("button", { name: "Create task" }).click();
    await expect.poll(async () => { const [x] = await serverTask(page, title); return [x.status, x.assignees, !!x.meta.draft]; }).toEqual([chosen.status, chosen.assignees, false]);
    await expect(page.locator("#drBody .draft-note")).toHaveCount(0);
    await page.evaluate(() => closeDrawer());

    /* Undo on the toast throws a draft away */
    const title2 = "Closed by mistake " + tag;
    await page.evaluate(() => newTaskModal());
    await page.locator(".dr-title").click(); await page.keyboard.type(title2);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await serverTask(page, title2)).length).toBe(1);
    ids.push((await serverTask(page, title2))[0].id);
    await page.locator(".undo-toast button", { hasText: "Undo" }).click();
    await expect.poll(async () => (await serverTask(page, title2)).length).toBe(0);

    /* nothing written, or Discard: nothing kept */
    const before = await page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.length));
    await page.evaluate(() => newTaskModal()); await page.evaluate(() => closeDrawer());
    await page.evaluate(() => newTaskModal()); await page.locator(".dr-title").click(); await page.keyboard.type("Thrown away " + tag);
    await page.locator("#drFoot").getByRole("button", { name: "Discard" }).click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.length))).toBe(before);

    expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("Saved as a draft in"), tr("Delete draft")]; UI_LANG = was; return r; })).toEqual(["Disimpan sebagai draft di", "Hapus draft"]);
  } finally {
    await page.evaluate(list => Promise.all(list.map(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}))), ids);
  }
});
