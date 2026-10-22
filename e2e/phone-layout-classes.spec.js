/* The phone layouts that used to key on :has() now key on classes the page draws with the same elements (performance
   stage 3): the List's table (table.tbl.lcol-tbl, was .tbl:has(td.tcheck-col)) and its wrapper (div.tbl-wrap.lcol-wrap),
   a task row whose right side is the slots (.row.task-row.task-row-cells, was :not(:has(>.meta-grid))), and a label's
   row in Settings (div.stage-edit.label-edit, was :has(>input[onchange^="renameLabel"])). With those :has() rules a task
   panel tab switch beside the List restyled the whole screen on a phone. Checked here at 390 px: each class is drawn
   where it belongs and only there, and the phone layout it carries is what is on screen. One project with two tasks is
   made through the API and removed after. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const TAG = "plc" + Date.now().toString(36);
let M = null;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async tag => {
    const st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), pid = "pplc" + tag, ids = [];
    await apiFetch("POST", "/api/projects", { id: pid, name: "Phone " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20) });
    for (let i = 0; i < 2; i++) ids.push((await apiFetch("POST", "/api/tasks", { title: "Phone " + (i + 1) + " " + tag, status: st[0], prio: "high", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], tags: [tag], proj: pid, startDate: iso(0), dueDate: iso(2 + i) })).id);
    return { pid, ids };
  }, TAG);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => { for (const id of m.ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {}); }, M);
  await page.close();
});

test("the List's table and wrapper carry lcol-tbl / lcol-wrap, and lay out as phone cards", async ({ page }) => {
  await signIn(page);
  await page.evaluate(pid => { S.taskScope = "all"; S.group = ""; S.filters = Object.assign(emptyTaskFilters(), { proj: pid }); go("tasks", "list"); }, M.pid);
  await expect(page.locator("#content table.tbl.lcol-tbl tbody tr[data-id]")).toHaveCount(2);
  const st = await page.evaluate(() => { const t = document.querySelector("#content table.tbl.lcol-tbl"), w = t.closest(".tbl-wrap"), tr = t.querySelector("tbody tr[data-id]"), th = t.querySelector("thead");
    return { wrapCls: w.classList.contains("lcol-wrap"), table: getComputedStyle(t).display, wrap: getComputedStyle(w).overflowX, head: getComputedStyle(th).display, row: getComputedStyle(tr).display, others: document.querySelectorAll(".lcol-wrap").length }; });
  /* the phone List: the table and its body are blocks, the head is gone, each row is a card */
  expect(st).toEqual({ wrapCls: true, table: "block", wrap: "visible", head: "none", row: st.row, others: 1 });
  expect(st.row).not.toBe("table-row");
  /* the Grid's table is not a List: no lcol-tbl, still a table */
  await page.evaluate(() => go("tasks", "grid"));
  await expect(page.locator("#content table.gridv")).toBeVisible();
  expect(await page.evaluate(() => { const t = document.querySelector("#content table.gridv"); return [t.classList.contains("lcol-tbl"), !!t.closest(".lcol-wrap")]; })).toEqual([false, false]);
  /* an empty List is a message, not an empty table */
  await page.evaluate(() => { S.filters = Object.assign(emptyTaskFilters(), { proj: "no-such-project" }); go("tasks", "list"); });
  await expect(page.locator("#content table.lcol-tbl")).toHaveCount(0);
});

test("a task row with slots carries task-row-cells and folds its slots on a phone; a row with the meta grid does not", async ({ page }) => {
  await signIn(page);
  await page.evaluate(pid => { S.projectTab = "overview"; go("projects", pid); }, M.pid);
  const rows = page.locator("#content .row.task-row");
  await expect(rows.first()).toBeVisible();
  const st = await page.evaluate(() => [...document.querySelectorAll("#content .row.task-row")].map(r => ({ cells: r.classList.contains("task-row-cells"), meta: !!r.querySelector(":scope > .meta-grid"), rcell: r.querySelector(".r > .rcell") ? getComputedStyle(r.querySelector(".r > .rcell")).display : null })));
  expect(st.length).toBeGreaterThan(0);
  for (const r of st) expect(r).toEqual({ cells: true, meta: false, rcell: "contents" });
  /* the rows of the calendar's "more" sheet are drawn with the meta grid: no task-row-cells there */
  const fixed = await page.evaluate(id => { const h = taskRow(task(id), { fixedMeta: true }); const d = document.createElement("div"); d.innerHTML = h; const r = d.firstElementChild; return { cells: r.classList.contains("task-row-cells"), meta: !!r.querySelector(":scope > .meta-grid") }; }, M.ids[0]);
  expect(fixed).toEqual({ cells: false, meta: true });
});

test("a label's row in Settings carries label-edit and takes the two-column phone grid", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { S.settingsTab = "labels"; go("settings"); });
  await expect(page.locator("#content .stage-edit.label-edit").first()).toBeVisible();
  const st = await page.evaluate(() => { const rows = [...document.querySelectorAll("#content .stage-edit")]; const lab = rows.filter(r => r.classList.contains("label-edit"));
    return { all: lab.every(r => /^renameLabel\(/.test(r.querySelector(":scope > input").getAttribute("onchange"))), others: rows.filter(r => !r.classList.contains("label-edit")).some(r => { const i = r.querySelector(":scope > input"); return i && /^renameLabel\(/.test(i.getAttribute("onchange") || ""); }), cols: getComputedStyle(lab[0]).gridTemplateColumns.split(" ").length, input: getComputedStyle(lab[0].querySelector(":scope > input")).gridRowStart }; });
  expect(st).toEqual({ all: true, others: false, cols: 2, input: "1" });
});
