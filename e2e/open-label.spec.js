/* "open" meant two things (Oct 2026): a count — tasks not finished — and a verb — Enter opens what the palette
   picked. In Indonesian both read "buka", so a team card said "9 buka". A team's unfinished work is now its
   "active tasks" ("task aktif"); the palette's Enter "choose" ("pilih"); other counts of open work "belum selesai". */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("a team's unfinished work reads as active tasks; the palette's Enter chooses", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const made = await page.evaluate(async () => {
    const id = "tlabel" + Date.now().toString(36);
    await apiFetch("POST", "/api/teams", { id, name: "Label Team", color: "blue", lead: ME, members: [ME] });
    await apiFetch("POST", "/api/members/" + ME + "/team", { teamId: id }).catch(() => {});
    const d = await apiFetch("POST", "/api/tasks", { title: "Label task", status: WS.workflow[1].id, prio: "medium", team: id, assignee: ME, assignees: [ME] });
    await reloadAll();
    return { team: id, task: d.id };
  });
  try {
    await page.evaluate(() => go("teams"));
    const card = page.locator(".tcard", { hasText: "Label Team" });
    await expect(card).toContainText("active tasks");
    await expect(card).not.toContainText(/\bopen\b/);
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(card).toContainText("task aktif");
    await expect(card).not.toContainText(/\bbuka\b/);
    /* Home → Team workload says the same */
    await page.evaluate(() => { UI_LANG = "en"; const p = myPrefs(); p.dashScope = Object.assign({}, p.dashScope, { workload: "all" }); go("home"); });
    await expect(page.locator('[data-sec="workload"]')).toContainText("active tasks");
    /* the palette: Enter chooses */
    await page.keyboard.press("Control+k");
    await expect(page.locator(".palette-foot")).toContainText("↵ choose");
    await page.keyboard.press("Escape");
    /* other counts of open work, in Indonesian */
    expect(await page.evaluate(() => { UI_LANG = "id"; const s = tr("open"); UI_LANG = "en"; return s; })).toBe("belum selesai");
    expect(await page.evaluate(() => { UI_LANG = "id"; const s = tr("choose"); UI_LANG = "en"; return s; })).toBe("pilih");
    expect(await page.evaluate(() => { UI_LANG = "id"; const s = tr("select"); UI_LANG = "en"; return s; }), "the custom field type keeps its word").toBe("Pilihan");
  } finally {
    await page.evaluate(async m => { const p = myPrefs(); if (p.dashScope) delete p.dashScope.workload; UI_LANG = "en"; await apiFetch("DELETE", "/api/tasks/" + m.task).catch(() => {}); await apiFetch("DELETE", "/api/teams/" + m.team).catch(() => {}); }, made);
  }
});
