/* A task's projects are chosen in one picker: "Select project later" first (in no project for now),
   then any number of projects — a task can serve two campaigns, and shows in each. The field lists them.
   And the browser tab carries a red dot while notifications wait. Server rules: tests/multi-project.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("a task in two projects, then in none for now", async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const ids = await page.evaluate(async t => {
    const a = "p_sp_" + t, b = "p_rm_" + t;
    for (const [id, name] of [[a, "Spring " + t], [b, "Ramadan " + t]]) { const l = await apiFetch("POST", "/api/projects", { id, name, status: "active" }); PROJECTS = l.map(hProject); }
    const d = await apiFetch("POST", "/api/tasks", { title: "Shared " + t, status: WS.workflow[0].id, prio: "medium", proj: a });
    TASKS.push(hTask(d)); return { a, b, task: d.id };
  }, tag);
  const server = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => (t.proj || "") + "|" + (t.alsoIn || []).join(",")), ids.task);
  try {
    await page.evaluate(i => { openTask(i); renderDrawer(); }, ids.task);
    const field = page.locator('#drawer [onclick="taskProjectPicker(this)"]');
    await expect(field).toContainText("Spring " + tag);
    await field.click();
    const picker = page.locator("#entityPicker");
    await expect(picker.locator(".ep-row").first()).toContainText("Select project later");
    /* add the second project: the picker stays open, both are ticked */
    await picker.locator(".ep-row", { hasText: "Ramadan " + tag }).click();
    await expect.poll(server).toBe(ids.a + "|" + ids.b);
    await expect(picker.locator(".ep-row.chosen")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator('#drawer [onclick="taskProjectPicker(this)"]')).toContainText("Spring " + tag + ", Ramadan " + tag);
    /* it shows in the second project too */
    await page.evaluate(b => { closeDrawer(); go("projects", b); }, ids.b);
    await expect(page.locator("#content", { hasText: "Shared " + tag })).toBeVisible();

    /* in none for now */
    await page.evaluate(i => { openTask(i); renderDrawer(); }, ids.task);
    await page.locator('#drawer [onclick="taskProjectPicker(this)"]').click();
    await page.locator("#entityPicker .ep-row", { hasText: "Select project later" }).click();
    await expect.poll(server).toBe("|");
    await expect(page.locator('#drawer [onclick="taskProjectPicker(this)"]')).toContainText("No project");

    /* in Indonesian */
    await page.evaluate(() => setLanguage("id"));
    await page.locator('#drawer [onclick="taskProjectPicker(this)"]').click();
    await expect(page.locator("#entityPicker .ep-row").first()).toContainText("Pilih proyek nanti");
    await page.keyboard.press("Escape");
    await page.evaluate(() => { setLanguage("en"); closeDrawer(); });
  } finally {
    await page.evaluate(x => Promise.all([apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {}), apiFetch("DELETE", "/api/projects/" + x.a).catch(() => {}), apiFetch("DELETE", "/api/projects/" + x.b).catch(() => {})]), ids);
  }
});

test("the tab icon carries a red dot while notifications wait", async ({ page }) => {
  await signIn(page);
  const href = () => page.locator("#favicon").getAttribute("href");
  await page.evaluate(() => { NOTIFS.forEach(n => { n.read = true; }); syncNotifDot(); });
  const base = await href();
  await page.evaluate(() => { NOTIFS.unshift({ id: "nt_dot", k: "assigned", who: ME, t: "T-1", ago: 0, read: false }); syncNotifDot(); });
  await expect.poll(href).toMatch(/^data:image\/png/);
  /* the dot is red, top right */
  const px = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); x.drawImage(i, 0, 0); r(Array.from(x.getImageData(47, 17, 1, 1).data)); }; i.src = document.getElementById("favicon").getAttribute("href"); }));
  expect(px[0]).toBeGreaterThan(200); expect(px[1]).toBeLessThan(90);
  /* read: back to the plain icon */
  await page.evaluate(() => { NOTIFS.forEach(n => { n.read = true; }); syncNotifDot(); });
  await expect.poll(href).toBe(base);
  await page.evaluate(() => { NOTIFS.splice(NOTIFS.findIndex(n => n.id === "nt_dot"), 1); });
});
