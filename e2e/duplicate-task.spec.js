/* A duplicated task is work still to be done (Oct 2026): it keeps the brief, the people and the estimate, but not the
   hours spent on the original nor a lead's validation of its asset counts — those used to be copied, so a duplicate
   arrived "validated by" someone with hours already spent. The server drops a validation sent with any new task too
   (tests/asset-split.test.js). */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("a duplicate keeps the plan but not the hours spent or the validation", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const ids = [];
  try {
    const src = await page.evaluate(async () => {
      const d = await apiFetch("POST", "/api/tasks", { title: "Original " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], effort: 6, meta: { actualEffort: 3, assetSplit: { [ME]: 2 } } });
      /* the admin validates the counts, as a lead would */
      const t = hTask(d); t.meta = Object.assign({}, t.meta, { assetSplitOk: { by: ME } });
      const v = await apiFetch("PUT", "/api/tasks/" + d.id, dTask(t)); TASKS.push(hTask(v)); return v;
    });
    ids.push(src.id);
    expect(src.meta.assetSplitOk && src.meta.assetSplitOk.by, "the original is validated").toBeTruthy();
    expect(src.meta.actualEffort).toBe(3);
    const before = await page.evaluate(() => TASKS.length);
    await page.evaluate(i => duplicateTask(i), src.id);
    await page.waitForFunction(n => TASKS.length > n && TASKS.some(t => / \(copy\)$/.test(t.title)), before);
    const copyId = await page.evaluate(t => TASKS.find(x => x.title === t + " (copy)").id, src.title);
    ids.push(copyId);
    const copy = await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), copyId);
    expect(copy.effort, "the estimate is kept").toBe(6);
    expect(copy.meta.assetSplit, "the plan of who makes what is kept").toEqual({ [src.assignee]: 2 });
    expect(copy.meta.actualEffort, "no hours spent yet").toBeUndefined();
    expect(copy.meta.assetSplitOk, "not validated yet").toBeUndefined();
    const again = await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), src.id);
    expect(again.meta.actualEffort, "the original keeps its hours").toBe(3);
    expect(again.meta.assetSplitOk.by).toBeTruthy();
  } finally {
    await page.evaluate(async l => { closeDrawer(); for (const i of l) await apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); await reloadAll(); }, ids);
  }
});
