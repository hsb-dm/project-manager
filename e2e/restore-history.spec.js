/* An admin goes back to a point in a task's Activity: the entry has a "Go back" button, the dialog
   shows what would change (now → after going back), and the task is put back. In Indonesian the
   button reads "Kembalikan". The server's rules: tests/restore-history.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("an admin goes back to a point in a task's Activity", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const id = await page.evaluate(async () => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Going back " + Date.now(), status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] });
    const t = hTask(d); TASKS.push(t);
    const moved = await apiFetch("POST", "/api/tasks/" + t.id + "/move", { type: "MOVE_TASK_STATUS", fromStatusId: WS.workflow[0].id, toStatusId: WS.workflow[1].id });
    replaceInto(t, hTask(moved)); return t.id;
  });
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "activity"; renderDrawer(); }, id);
    const created = page.locator("#drawer .tl .it", { hasText: "created the task" });
    await expect(created.locator(".act-restore")).toBeVisible();
    await created.locator(".act-restore").click();
    await expect(page.locator("#modal h3")).toContainText("Go back to this point?");
    const stage = page.locator("#modal .restore-diff li", { hasText: "Stage" });
    await expect(stage.locator(".was")).toHaveText(await page.evaluate(() => stageName(WS.workflow[1].id)));
    await expect(stage.locator(".becomes")).toHaveText(await page.evaluate(() => stageName(WS.workflow[0].id)));
    await page.locator("#modal .btn.primary", { hasText: "Go back" }).click();
    await expect(page.locator(".toast").last()).toContainText("Gone back to the earlier point");
    expect(await page.evaluate(i => task(i).status === WS.workflow[0].id, id)).toBe(true);
    await expect(page.locator("#drawer .tl .it.restored")).toHaveCount(1);
    /* in Indonesian */
    await page.evaluate(() => { setLanguage("id"); renderDrawer(); });
    await expect(page.locator("#drawer .tl .it .act-restore").first()).toContainText("Kembalikan");
    await page.evaluate(() => setLanguage("en"));
    /* someone who is not an admin sees no button */
    await page.evaluate(() => { window._has = has; has = c => c === "manage_workspace" ? false : window._has(c); renderDrawer(); });
    await expect(page.locator("#drawer .act-restore")).toHaveCount(0);
    await page.evaluate(() => { has = window._has; });
  } finally { await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id); }
});
