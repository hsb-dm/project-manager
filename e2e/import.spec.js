/* Importing a JSON snapshot through the real screens: the export the page makes, edited, then
   brought back whole or in part. The dates matter most — the file stores them as days from the day
   it was exported, and the browser has to turn them back into the same calendar dates. */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const MEMBER = { email: "imp-member@e2e.test", pw: "Member!Import-2026", name: "Import Member" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);
let snapshot = null, taskId = null, taskDue = null;

async function signIn(page, who, target) {
  await page.goto(target || "/");
  await page.locator("#au_email").fill((who || ADMIN).email);
  await page.locator("#au_pw").fill((who || ADMIN).pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const api = (page, m, u, b) => page.evaluate(([m, u, b]) => apiFetch(m, u, b), [m, u, b]);
async function openImportExport(page) {
  await page.goto("/settings/backup"); await ready(page);
  await page.evaluate(() => { S.backupSection = "io"; renderScreen(false); });
}
/* choose a file through the real picker, with the snapshot as it was edited */
async function importFile(page, data) {
  await openImportExport(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Import from a JSON snapshot|Impor dari snapshot JSON/ }).click();
  await (await chooser).setFiles({ name: "snapshot.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator("#impBody")).toBeVisible();
}
const settle = page => expect(page.locator("#impGo")).toBeEnabled({ timeout: 10000 });

test("export a snapshot from the page", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Import project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Import project"))).toBe(true);
  await page.evaluate(() => { newTaskModal({ title: "Original task", proj: PROJECTS.find(p => p.name === "Import project").id, assignee: ME }); createDraft(); });
  await expect.poll(() => page.evaluate(() => (TASKS.find(t => t.title === "Original task" && !t._draft && t.id !== "T-new") || {}).id || "")).not.toBe("");
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Original task" && !t._draft).id);
  taskDue = (await api(page, "GET", "/api/tasks/" + taskId)).dueDate;
  await page.evaluate(() => { WS.ai = WS.ai || {}; WS.ai.basePrompt = "Brand voice: before import"; return persistWS(); });

  const dl = page.waitForEvent("download");
  await page.evaluate(() => exportJSON());
  snapshot = JSON.parse(fs.readFileSync(await (await dl).path(), "utf8"));
  expect(snapshot.tasks.some(t => t.id === taskId)).toBe(true);
  expect(Array.isArray(snapshot.knowledgeFolders)).toBe(true);        /* folders now travel with pages */
});

test("the dead-end button is gone; a real import is offered", async ({ page }) => {
  await signIn(page);
  await openImportExport(page);
  await expect(page.getByRole("button", { name: /Import from a JSON snapshot/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Take a safety backup before importing/ })).toHaveCount(0);
});

test("importing only the AI settings changes nothing else", async ({ page }) => {
  await signIn(page);
  const edited = JSON.parse(JSON.stringify(snapshot));
  edited.ws.name = "Should Not Be Renamed";
  edited.ws.ai = Object.assign({}, edited.ws.ai, { basePrompt: "Brand voice: from the file" });
  edited.tasks.push(Object.assign({}, edited.tasks.find(t => t.id === taskId), { id: "T-990", title: "Must not arrive" }));
  await importFile(page, edited);
  await page.getByRole("button", { name: "AI settings only" }).click();
  await expect(page.locator('input[data-imp="ai"]')).toBeChecked();
  await expect(page.locator('input[data-imp="identity"]')).not.toBeChecked();
  await expect(page.locator('input[data-imp="projects"]')).not.toBeChecked();
  await settle(page);
  await page.locator("#impGo").click();
  await expect(page.locator("#modal")).toContainText(/imported/i);

  const w = (await api(page, "GET", "/api/bootstrap")).ws;
  expect(w.ai.basePrompt).toBe("Brand voice: from the file");
  expect(w.name).not.toBe("Should Not Be Renamed");
  expect(await page.evaluate(() => apiFetch("GET", "/api/tasks/T-990").then(() => "found", () => "absent"))).toBe("absent");
});

test("a new task keeps its calendar dates; an existing one is left alone", async ({ page }) => {
  await signIn(page);
  const edited = JSON.parse(JSON.stringify(snapshot));
  const orig = edited.tasks.find(t => t.id === taskId);
  edited.tasks.find(t => t.id === taskId).title = "Changed in the file";
  edited.tasks.push(Object.assign(JSON.parse(JSON.stringify(orig)), { id: "T-991", title: "Arrived from the file" }));
  await importFile(page, edited);
  await page.getByRole("button", { name: "Everything" }).click();
  await expect(page.locator('input[name="impConflict"][value="skip"]')).toBeChecked();     /* the safe choice is the default */
  await settle(page);
  await expect(page.locator(".imp-row", { has: page.locator('input[data-imp="projects"]') })).toContainText(/1 new/);
  await page.locator("#impGo").click();
  await expect(page.locator("#modal")).toContainText(/imported/i);

  const arrived = await api(page, "GET", "/api/tasks/T-991");
  expect(arrived.title).toBe("Arrived from the file");
  expect(arrived.dueDate).toBe(taskDue);                         /* the same calendar day, not shifted */
  expect((await api(page, "GET", "/api/tasks/" + taskId)).title).toBe("Original task");
});

/* The test above imports on the day it exported, where the date shift is zero and would pass even
   with the shift missing. Pretend this file was exported ten days ago: its offsets are counted from
   then, so the task must land ten days earlier than the original's due date. */
test("a snapshot exported days ago lands on its own calendar dates", async ({ page }) => {
  await signIn(page);
  const edited = JSON.parse(JSON.stringify(snapshot));
  const exported = new Date(snapshot.baseDate + "T00:00:00"); exported.setDate(exported.getDate() - 10);
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  edited.baseDate = ymd(exported);
  edited.tasks = [Object.assign(JSON.parse(JSON.stringify(snapshot.tasks.find(t => t.id === taskId))), { id: "T-993", title: "Exported ten days ago" })];
  await importFile(page, edited);
  await page.getByRole("button", { name: "Everything" }).click();
  await settle(page);
  await page.locator("#impGo").click();
  await expect(page.locator("#modal")).toContainText(/imported/i);
  const want = new Date(taskDue + "T00:00:00"); want.setDate(want.getDate() - 10);
  expect((await api(page, "GET", "/api/tasks/T-993")).dueDate).toBe(ymd(want));
  await page.evaluate(() => apiFetch("DELETE", "/api/tasks/T-993").catch(() => {}));
});

test("a preview changes nothing", async ({ page }) => {
  await signIn(page);
  const counts = b => ["projects", "requests", "assets", "knowledge", "teams"].map(k => (b[k] || []).length).concat([Object.keys(b.people || {}).length, (b.ws.workflow || []).length]);
  const before = counts(await api(page, "GET", "/api/bootstrap"));
  const edited = JSON.parse(JSON.stringify(snapshot));
  edited.tasks.push(Object.assign({}, edited.tasks[0], { id: "T-992", title: "Only previewed" }));
  await importFile(page, edited);
  await page.getByRole("button", { name: "Everything" }).click();
  await settle(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(counts(await api(page, "GET", "/api/bootstrap"))).toEqual(before);
  expect(await page.evaluate(() => apiFetch("GET", "/api/tasks/T-992").then(() => "found", () => "absent"))).toBe("absent");
});

test("every import takes a safety backup first", async ({ page }) => {
  await signIn(page);
  const list = await api(page, "GET", "/api/backups");
  const backups = list.backups || list;
  expect(backups.filter(b => b.kind === "pre-import").length).toBeGreaterThanOrEqual(2);
});

test("a member may not import", async ({ browser, page }) => {
  await signIn(page);
  const added = await api(page, "POST", "/api/members", { id: "impmember", name: MEMBER.name, email: MEMBER.email, perm: "member", ini: "IM", teams: [] });
  await api(page, "POST", "/api/members/" + added.id + "/password", { password: MEMBER.pw });
  const ctx = await browser.newContext(), p = await ctx.newPage();
  await signIn(p, MEMBER);
  const body = { sections: ["ai"], data: { ws: { ai: { basePrompt: "x" } } } };
  for (const url of ["/api/admin/import/preview", "/api/admin/import"]) {
    const r = await p.evaluate(([u, b]) => fetch(u, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(x => x.status), [url, body]);
    expect(r, url).toBe(403);
  }
  await ctx.close();
});

test("the import screen speaks Indonesian too", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => setLanguage("id"));
  await importFile(page, snapshot);
  await expect(page.locator("#modal")).toContainText("Impor snapshot");
  await expect(page.locator("#modal")).toContainText("Pertahankan yang ada dan lewati");
  await expect(page.locator("#modal")).toContainText("Setelan & preset AI");
  await page.evaluate(() => { closeModal(); setLanguage("en"); });
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    for (const id of [taskId, "T-991"]) if (id) await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id);
    await page.evaluate(() => apiFetch("DELETE", "/api/members/impmember").catch(() => {}));
  } catch {} finally { await page.close(); }
});
