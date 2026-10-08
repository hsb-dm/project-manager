/* A task's Progress note, beside Comments: free text written like the description, kept as versions —
   saving changes the latest, "New version" starts the next, the ones before stay to be read. The people the
   task concerns hear of a new version; stakeholders never see it. The Excel export takes the latest (or a
   chosen version, or all of them on their own sheet), and the Tasks sheet's columns can be chosen. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tag = Date.now().toString(36);
const DOER = { name: "Prog " + tag, email: "prog-" + tag + "@e2e.test", pw: "Prog!Notes-2026x" };
const CLIENT = { name: "Client " + tag, email: "client-" + tag + "@e2e.test", pw: "Client!Notes-2026x" };
let x = {};
const server = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => (t.progress || []).map(p => "V" + p.v + ":" + p.text)), id || x.task);
const openProgress = page => page.evaluate(id => { openTask(id); S.drawerTab = "progress"; renderDrawer(); }, x.task);

test("setup: a task, its assignee, a stakeholder", async ({ page }) => {
  await signIn(page, ADMIN);
  x = await page.evaluate(async o => {
    const out = {};
    for (const [k, p, extra] of [["doer", o.doer, {}], ["client", o.client, { stakeholder: true }]]) { await apiFetch("POST", "/api/members", Object.assign({ name: p.name, email: p.email, perm: "member", cap: 40 }, extra)); const people = (await apiFetch("GET", "/api/bootstrap")).people; out[k] = Object.keys(people).find(id => people[id].email === p.email); await apiFetch("POST", "/api/members/" + out[k] + "/password", { password: p.pw }); }
    const d = await apiFetch("POST", "/api/tasks", { title: "Progress " + o.tag, status: WS.workflow[0].id, prio: "medium", assignee: out.doer, assignees: [out.doer] }); out.task = d.id;
    await reloadAll(); return out;
  }, { doer: DOER, client: CLIENT, tag });
});

test("the tab sits beside Comments; the first note is V1, and saving again changes V1", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, x.task);
  const tabs = await page.locator("#drHead .tabs .tab").allInnerTexts();
  const names = tabs.map(t => t.replace(/\s*\d+$|\s*V\d+$/, "").trim());
  expect(names.indexOf("Progress note")).toBe(names.indexOf("Comments") + 1);
  await page.locator("#drHead .tabs .tab", { hasText: "Progress note" }).click();
  await expect(page.locator("#drBody .pn-empty")).toContainText("No progress note yet");
  await page.getByRole("button", { name: "Write the first note" }).click();
  await expect(page.locator("#pnSrc")).toBeFocused();
  await page.keyboard.type("Moodboard done");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Next: first draft");
  await page.locator("#pnSave").click();
  await expect.poll(() => server(page)).toEqual(["V1:Moodboard done\nNext: first draft"]);
  await expect(page.locator("#drBody .pn-chip.on")).toHaveText("V1");
  await expect(page.locator("#drHead .tabs .tab", { hasText: "Progress note" })).toContainText("V1");
  /* Edit changes V1 — no new version */
  await page.getByRole("button", { name: "Edit" }).click();
  await page.locator("#pnSrc").click(); await page.keyboard.press("Control+End");
  await page.keyboard.type(" (Friday)");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => server(page)).toEqual(["V1:Moodboard done\nNext: first draft (Friday)"]);
  await expect(page.locator("#drBody .pn-meta")).toContainText("edited");
  /* the assignee heard of V1 */
  const doer = await (await page.context().browser().newContext()).newPage(); await signIn(doer, DOER);
  expect(await doer.evaluate(t => apiFetch("GET", "/api/bootstrap").then(d => d.notifs.filter(n => n.t === t).map(n => n.k)), x.task)).toContain("progress");
  await doer.context().close();
});

test("New version starts from the latest text; the earlier one stays to be read; only the latest can change", async ({ page }) => {
  await signIn(page, ADMIN);
  await openProgress(page);
  await page.getByRole("button", { name: "New version" }).click();
  await expect(page.locator("#pnSrc")).toContainText("Moodboard done");
  await expect(page.locator("#drBody .pn-chip.new")).toContainText("V2");
  await page.locator("#pnSrc").click(); await page.keyboard.press("Control+A");
  await page.keyboard.type("First draft sent to the client");
  /* a redraw from elsewhere while writing: nothing typed is lost, the caret stays */
  await page.evaluate(() => renderDrawer());
  await page.keyboard.type(" on Monday");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect.poll(() => server(page)).toEqual(["V1:Moodboard done\nNext: first draft (Friday)", "V2:First draft sent to the client on Monday"]);
  await expect(page.locator("#drBody .pn-chip")).toHaveText(["V1", "V2"]);
  /* V1 is still there, read-only */
  await page.locator("#drBody .pn-chip", { hasText: "V1" }).click();
  await expect(page.locator("#drBody .pn-view")).toContainText("Moodboard done");
  await expect(page.locator("#drBody .pn-old")).toContainText("An earlier version");
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  /* the server says the same */
  const refused = await page.evaluate(id => apiFetch("PUT", "/api/tasks/" + id + "/progress/1", { text: "rewrite history" }).then(() => "ok", e => e.message), x.task);
  expect(refused).toContain("Only the latest version can be changed");
  /* Activity tells the story */
  await page.evaluate(() => { S.drawerTab = "activity"; renderDrawer(); });
  await expect(page.locator("#drBody")).toContainText("wrote progress note V2");
  await expect(page.locator("#drBody")).toContainText("updated progress note V1");
});

test("a stakeholder neither sees nor writes progress notes", async ({ browser }) => {
  const client = await (await browser.newContext()).newPage(); await signIn(client, CLIENT);
  const seen = await client.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(t => (t.progress || []).length, e => "hidden:" + e.message), x.task);
  expect(seen === 0 || String(seen).startsWith("hidden")).toBe(true);
  const write = await client.evaluate(id => apiFetch("POST", "/api/tasks/" + id + "/progress", { text: "client note" }).then(() => "ok", e => e.message), x.task);
  expect(write).not.toBe("ok");
  await client.context().close();
});

test("Excel: the latest note by default, a chosen version, or all of them; the Tasks columns can be chosen", async ({ page }) => {
  await signIn(page, ADMIN);
  const out = await page.evaluate(id => {
    const t = task(id), base = { from: -3650, to: 3650, teams: [], projects: [], labels: [], people: [], status: "all" }, col = (rows, h) => rows[0].indexOf(h), row = rows => rows.find(r => r[0] === id);
    EXPORT = Object.assign({}, base); const all = taskRows([t]);
    EXPORT = Object.assign({}, base, { pnVersion: 1 }); const v1 = taskRows([t]);
    EXPORT = Object.assign({}, base, { pnVersion: "all" }); const every = pnRows([t]);
    EXPORT = Object.assign({}, base, { pnVersion: 3 }); const none = taskRows([t]);
    EXPORT = Object.assign({}, base, { cols: ["title", "due", "pnText"] }); const some = taskRows([t]);
    EXPORT = null;
    return { latest: [row(all)[col(all, "Progress note")], row(all)[col(all, "Note version")], !!row(all)[col(all, "Note updated")]], v1: row(v1)[col(v1, "Progress note")], every: every.slice(1).map(r => r[4] + ":" + r[5]), none: row(none)[col(none, "Progress note")], someHead: some[0], someDates: some.dateCols, allDates: all.dateCols.map(i => all[0][i]) };
  }, x.task);
  expect(out.latest).toEqual(["First draft sent to the client on Monday", "V2", true]);
  expect(out.v1).toBe("Moodboard done\nNext: first draft (Friday)");
  expect(out.every).toEqual(["V1:Moodboard done\nNext: first draft (Friday)", "V2:First draft sent to the client on Monday"]);
  expect(out.none).toBe("");
  expect(out.someHead).toEqual(["ID", "Title", "Due", "Progress note"]);   /* ID and Title always stay */
  expect(out.someDates).toEqual([2]);                                       /* Due is still a date, wherever it lands */
  expect(out.allDates).toEqual(["Start", "Due"]);
  /* the export window: the columns, and the note version (latest unless chosen) */
  await page.evaluate(() => exportModal("xlsx"));
  await expect(page.locator("#modal .ex-cols")).toContainText("Task columns");
  await expect(page.locator('#modal [data-col="id"]')).toBeDisabled();
  await expect(page.locator("#ex_pnv")).toHaveValue("latest");
  const opts = await page.locator("#ex_pnv option").allInnerTexts();
  expect(opts.slice(0, 2)).toEqual(["Latest version", "All versions"]);
  expect(opts).toContain("V2");
  await expect(page.locator("#modal .report-slide-chip", { hasText: "Progress notes" })).toBeVisible();
  /* a column left out is remembered for next time */
  await page.locator('#modal [data-col="reviewer"]').uncheck();
  await expect(page.locator("#ex_colcount")).toContainText(/\d+ of \d+ columns/);
  const download = page.waitForEvent("download");
  await page.locator("#modal").getByRole("button", { name: "Export" }).click();
  await download;
  await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.people[ME].prefs || {}).exportColsOff))).toEqual(["reviewer"]);
  await page.evaluate(() => exportModal("csv"));
  await expect(page.locator('#modal [data-col="reviewer"]')).not.toBeChecked();
  await expect(page.locator("#ex_pnv option", { hasText: "All versions" })).toHaveCount(0);   /* a CSV is one table */
  await page.evaluate(() => { EXF.colsOff = []; myPrefs().exportColsOff = []; saveMyPrefs(); closeModal(); });
  expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("Progress note"), tr("Latest version"), tr("Task columns")]; UI_LANG = was; return r; })).toEqual(["Catatan progres", "Versi terbaru", "Kolom task"]);
});

test("whoever wrote a version, or an admin, deletes it; the one before becomes the latest", async ({ page }) => {
  await signIn(page, ADMIN);
  await openProgress(page);
  await page.getByRole("button", { name: "Delete version" }).click();
  await page.locator("#modal").getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => server(page)).toEqual(["V1:Moodboard done\nNext: first draft (Friday)"]);
  await expect(page.locator("#drBody .pn-chip")).toHaveText(["V1"]);
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("cleanup", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.evaluate(o => apiFetch("DELETE", "/api/tasks/" + o.task).catch(() => {}).then(() => Promise.all([o.doer, o.client].map(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {})))), x);
});
