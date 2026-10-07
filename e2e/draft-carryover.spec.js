/* A new task starts empty. Every task being created carries the id "T-new", and the editor of the one
   just created stays in the page, marked with that id: the next new task took its description (and its
   brief fields) as its own until a reload. Editors are now marked with the draft's own key. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("the next new task does not take the last one's description or brief", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36), made = [];
  try {
    /* A: written and created */
    await page.evaluate(t => newTaskModal({ title: "Carry A " + t, assignee: ME }), tag);
    await page.locator("#descSrc").click();
    await page.keyboard.type("Description of A " + tag);
    await page.evaluate(() => createDraft());
    /* straight to the next new task, before A is back from the server */
    await page.evaluate(t => newTaskModal({ title: "Carry B " + t, assignee: ME }), tag);
    await expect(page.locator("#descSrc")).toBeVisible();
    await page.waitForTimeout(800);
    expect(await page.locator("#descSrc").textContent(), "B's editor starts empty").toBe("");
    expect(await page.evaluate(() => task("T-new").description || "")).toBe("");
    /* and again after A has been created and opened */
    await expect.poll(() => page.evaluate(t => (TASKS.find(x => x.title === "Carry A " + t && !x._draft && !x._creating) || {}).id || "", tag), { timeout: 10000 }).not.toBe("");
    await page.evaluate(t => { closeDrawer(); newTaskModal({ title: "Carry C " + t, assignee: ME }); }, tag);
    await page.waitForTimeout(500);
    expect(await page.locator("#descSrc").textContent()).toBe("");
    expect(await page.evaluate(() => task("T-new").description || "")).toBe("");
    made.push(...await page.evaluate(t => TASKS.filter(x => x.title.indexOf(t) >= 0 && !x._draft).map(x => x.id), tag));
    expect(await page.evaluate(([ids, t]) => apiFetch("GET", "/api/tasks/" + ids[0]).then(x => x.description), [made, tag])).toBe("Description of A " + tag);

    /* brief fields: typed into one new task, not in the next */
    const field = await page.evaluate(() => WS.briefTemplates[0].fields[0]);
    await page.evaluate(([t, tpl]) => { closeDrawer(); newTaskModal({ title: "Brief D " + t, assignee: ME, tpl }); S.drawerTab = "brief"; S.briefEdit = true; renderDrawer(); }, [tag, await page.evaluate(() => WS.briefTemplates[0].id)]);
    await page.locator('#drawer [data-bf="' + field + '"]').fill("Brief of D " + tag);
    await page.evaluate(() => createDraft());
    await page.evaluate(([t, tpl]) => { newTaskModal({ title: "Brief E " + t, assignee: ME, tpl }); S.drawerTab = "brief"; S.briefEdit = true; renderDrawer(); }, [tag, await page.evaluate(() => WS.briefTemplates[0].id)]);
    await page.waitForTimeout(500);
    await expect(page.locator('#drawer [data-bf="' + field + '"]')).toHaveValue("");
    await page.evaluate(() => renderDrawer());
    await expect(page.locator('#drawer [data-bf="' + field + '"]'), "nor after a redraw").toHaveValue("");
  } finally {
    await page.evaluate(() => { if (typeof discardDraft === "function" && S.drawerTask && (task(S.drawerTask) || {})._draft) discardDraft(); closeDrawer(); });
    await page.waitForTimeout(800);
    await page.evaluate(t => Promise.all(TASKS.filter(x => x.title.indexOf(t) >= 0 && !x._draft).map(x => apiFetch("DELETE", "/api/tasks/" + x.id).catch(() => {}))), tag);
  }
});
