/* A task's "Assets produced" (Oct 2026): focused, the number is selected whole and typing replaces it; no spinner
   arrows; only digits; ↑/↓ step it; Enter keeps it; Esc puts it back and leaves the task's panel open. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("Assets produced is typed straight over", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async () => (await apiFetch("POST", "/api/tasks", { title: "Count input " + Date.now(), status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME], assetCount: 2 })).id);
  try {
    await page.evaluate(async id => { await reloadAll(); go("tasks", "list"); openTask(id); S.drawerTab = "files"; renderDrawer(); }, id);
    const box = page.locator("#drawer .av-count .count-input");
    await expect(box).toHaveValue("2");
    expect(await box.getAttribute("type")).toBe("text");           /* no spinner arrows */
    await box.click();
    expect(await box.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, 1]);   /* all of it, ready to replace */
    await page.keyboard.type("1x2");                                 /* a letter does not get in */
    await expect(box).toHaveValue("12");
    await page.keyboard.press("ArrowUp");
    await expect(box).toHaveValue("13");
    await page.keyboard.press("Enter");
    await page.waitForFunction(id => assetCount(task(id)) === 13, id);
    /* Esc puts it back and the panel stays */
    await box.click(); await page.keyboard.type("99"); await page.keyboard.press("Escape");
    await expect(box).toHaveValue("13");
    await expect(page.locator("#drawer")).toHaveClass(/open/);
    expect(await page.evaluate(id => assetCount(task(id)), id)).toBe(13);
    /* the one in the panel's header works the same way */
    const pill = page.locator('#drawer [data-meta="assetCount"] .count-input');
    if (await pill.count()) { await pill.click(); expect(await pill.evaluate(el => el.selectionEnd - el.selectionStart)).toBe(2); await page.keyboard.press("Escape"); }
  } finally {
    await page.evaluate(async id => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});
