/* An export (Excel, CSV, PowerPoint) takes every task still open or not yet due, and the finished ones due in
   its period; only work finished before the period began is left out. Only "due inside the period" used to
   count, so with the default period (the last 8 weeks, up to today) a new task — due in a few days — and its
   progress note never reached the workbook. */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("a new task and its progress note are in an export with the default period", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const tag = Date.now().toString(36);
  const x = await page.evaluate(async t => {
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const mk = async (title, s, e, extra) => (await apiFetch("POST", "/api/tasks", Object.assign({ title: title + " " + t, status: WS.workflow[0].id, prio: "medium", startDate: day(s), dueDate: day(e) }, extra || {}))).id;
    const closed = (WS.workflow.find(s => s.kind === "closed") || WS.workflow[WS.workflow.length - 1]).id;
    const o = {
      fresh: await mk("New this week", 0, 5),                       /* the case: due in a few days */
      overdue: await mk("Long overdue, still open", -120, -100),    /* still work going on */
      later: await mk("Starts next month", 40, 45),                 /* not yet due: in */
      oldDone: await mk("Done long ago", -130, -100, { status: closed, reviewer: ME, reviewers: [ME] })
    };
    await apiFetch("POST", "/api/tasks/" + o.fresh + "/progress", { text: "Kickoff done " + t });
    await reloadAll(); return o;
  }, tag);
  try {
    await page.evaluate(() => exportModal("xlsx"));
    await expect(page.locator("#ex_from")).toBeVisible();
    const picked = await page.evaluate(o => { EXPORT = { from: offsetFromIso(val("ex_from")), to: offsetFromIso(val("ex_to")), teams: [], projects: [], labels: [], people: [], status: "all" }; const ids = exportTasks().map(t => t.id); const notes = pnRows(exportTasks()).slice(1).map(r => r[0]); EXPORT = null; return { fresh: ids.includes(o.fresh), overdue: ids.includes(o.overdue), later: ids.includes(o.later), oldDone: ids.includes(o.oldDone), note: notes.includes(o.fresh) }; }, x);
    expect(picked).toEqual({ fresh: true, overdue: true, later: true, oldDone: false, note: true });
    await expect(page.locator("#modal")).toContainText("every task still open or not yet due");
    /* and in the file itself */
    const download = page.waitForEvent("download");
    await page.locator("#modal").getByRole("button", { name: "Export" }).click();
    const file = await (await download).path();
    const bytes = fs.readFileSync(file).toString("utf8");
    expect(bytes).toContain("New this week " + tag);
    expect(bytes).toContain("Kickoff done " + tag);
    expect(bytes).toContain("Starts next month " + tag);
    expect(bytes).not.toContain("Done long ago " + tag);
    /* the CSV: the same tasks, with the note */
    await page.evaluate(() => exportModal("csv"));
    const csvDl = page.waitForEvent("download");
    await page.locator("#modal").getByRole("button", { name: "Export" }).click();
    const csv = fs.readFileSync(await (await csvDl).path(), "utf8");
    expect(csv).toContain("New this week " + tag); expect(csv).toContain("Kickoff done " + tag); expect(csv).toContain("Starts next month " + tag); expect(csv).not.toContain("Done long ago " + tag);
    /* PowerPoint reads the same task set */
    await page.evaluate(() => exportModal("ppt"));
    const ppt = await page.evaluate(o => { EXPORT = { from: offsetFromIso(val("ex_from")), to: offsetFromIso(val("ex_to")), teams: [], projects: [], labels: [], people: [], status: "all" }; const ids = reportTasks().map(t => t.id); EXPORT = null; closeModal(); return [ids.includes(o.fresh), ids.includes(o.later), ids.includes(o.oldDone)]; }, x);
    expect(ppt).toEqual([true, true, false]);
  } finally {
    await page.evaluate(o => Promise.all(Object.values(o).map(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}))), x);
  }
});

test("a date set by hand makes the period Custom; the Custom tab itself lights up too", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await page.evaluate(() => exportModal("xlsx"));
  const on = () => page.locator("#ex_presets button.on").allInnerTexts();
  expect(await on()).toEqual(["Last 8 weeks"]);
  await page.locator("#ex_from").fill("2026-01-05");
  await expect.poll(on).toEqual(["Custom"]);
  await page.locator("#ex_presets button", { hasText: "Last 4 weeks" }).click();
  await expect.poll(on).toEqual(["Last 4 weeks"]);
  await page.locator("#ex_to").fill("2026-12-31");
  await expect.poll(on).toEqual(["Custom"]);
  await page.locator("#ex_presets button", { hasText: "This month" }).click();
  await page.locator("#ex_presets button", { hasText: "Custom" }).click();
  await expect.poll(on).toEqual(["Custom"]);
  await expect(page.locator("#ex_from")).toBeFocused();
  await page.evaluate(() => closeModal());
});
