/* Choosing several projects for a task: each choice redraws the task panel, and the picker used to lose
   the button it hung from and jump to the top-left corner; the project just chosen also jumped into
   "Recent" at the top of the list. It now stays beside the field, scrolled where it was, in the same order. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("the project picker stays put, in the same order and scroll, while projects are chosen", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36);
  const made = await page.evaluate(async t => {
    const ids = [];
    for (let i = 0; i < 10; i++) { const id = "pstay" + t + i; ids.push(id); PROJECTS = (await apiFetch("POST", "/api/projects", { id, name: "Stay " + t + " " + i, status: "active", owner: ME })).map(hProject); }
    const d = await apiFetch("POST", "/api/tasks", { title: "Picker stays " + t, status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(d));
    EP.recentProjects = [];
    return { ids, task: d.id };
  }, tag);
  try {
    await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, made.task);
    await page.locator('#drawer button[onclick="taskProjectPicker(this)"]').click();
    const picker = page.locator("#entityPicker");
    await expect(picker).toBeVisible();
    const box0 = await picker.boundingBox();
    /* scroll the list down and choose one near the bottom of what shows */
    await page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"); l.scrollTop = l.scrollHeight; });
    const state = () => page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"); return { top: l.scrollTop, order: [...l.querySelectorAll(".ep-row")].map(b => b.textContent.replace(/\s+/g, " ").trim()) }; });
    const before = await state();
    const pick = async n => { await picker.locator(".ep-row", { hasText: "Stay " + tag + " " + n }).click(); await page.waitForTimeout(250); };
    for (const n of [8, 3]) {
      await pick(n);
      await expect(picker).toBeVisible();
      const box = await picker.boundingBox();
      expect(Math.abs(box.x - box0.x), "stays beside the field (x)").toBeLessThan(3);
      expect(Math.abs(box.y - box0.y), "stays beside the field (y)").toBeLessThan(3);
      const now = await state();
      expect(now.order, "the list keeps its order").toEqual(before.order);
      if (n === 8) expect(Math.abs(now.top - before.top), "and its scroll").toBeLessThan(3);
      await expect(picker.locator(".ep-row.chosen", { hasText: "Stay " + tag + " " + n })).toHaveCount(1);
    }
    /* both are the task's */
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(t => [t.proj].concat(t.alsoIn || []).filter(Boolean).sort()), made.task)).toEqual([made.ids[3], made.ids[8]].sort());
    /* the same field again closes it */
    await page.locator('#drawer button[onclick="taskProjectPicker(this)"]').click();
    await expect(picker).toHaveCount(0);
  } finally {
    await page.evaluate(x => { closeDrawer(); return Promise.all([apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {})].concat(x.ids.map(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {})))); }, made);
  }
});
