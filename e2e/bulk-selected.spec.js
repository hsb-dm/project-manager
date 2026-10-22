/* Select mode marks a ticked card or row with .bulk-selected (src/enhance.js bulkMark), and the highlight keys on that
   class instead of :has(.bulk-check input:checked), which had every DOM change on the page (a task panel tab switch
   beside a long List) check every row again (performance stage 3). The class follows the tick wherever it changes —
   a click on the box, a tap on the row, Select all, a redraw that draws the rows again — and the rows look as they
   did: the List's cells and a project's rows tinted, a Kanban card ringed, a phone's List card tinted as one card.
   Three tasks in one project are made through the API and removed after. */
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
const TAG = "bsel" + Date.now().toString(36);
let M = null;   /* { pid, ids } */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async tag => {
    const st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), pid = "pbs" + tag, ids = [];
    await apiFetch("POST", "/api/projects", { id: pid, name: "Select " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20) });
    for (let i = 0; i < 3; i++) ids.push((await apiFetch("POST", "/api/tasks", { title: "Select " + (i + 1) + " " + tag, status: st[0], prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], tags: [tag], proj: pid, startDate: iso(1), dueDate: iso(3 + i) })).id);
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
/* the project's tasks in a task view, select mode on */
const view = (page, v) => page.evaluate(([v, pid]) => { S.taskScope = "all"; S.group = ""; S.sort = "manual"; S.sortDir = 1; S.filters = Object.assign(emptyTaskFilters(), { proj: pid }); ENH.bulk = false; go("tasks", v); bulkToggle(); }, [v, M.pid]);
const soft = page => page.evaluate(() => { const p = document.createElement("div"); p.style.background = "var(--color-primary-soft)"; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; });
const marked = (page, sel) => page.$$eval(sel, l => l.filter(x => x.classList.contains("bulk-selected")).map(x => x.getAttribute("data-id")));
const box = (page, id) => page.locator('#content .bulk-check input[data-bulk-id="' + id + '"]').first();

test("List: the tick puts .bulk-selected on its row and takes it off again; Select all and a redraw keep it; the cells are tinted as before", async ({ page }) => {
  await signIn(page); await view(page, "list");
  const rows = "#content .lcol-tbl tbody tr[data-id]";
  await expect(page.locator(rows)).toHaveCount(3);
  expect(await marked(page, rows)).toEqual([]);
  await box(page, M.ids[0]).check();
  await expect(page.locator(rows + ".bulk-selected")).toHaveCount(1);
  expect(await marked(page, rows)).toEqual([M.ids[0]]);
  const tint = await soft(page);
  const bg = id => page.$eval(rows + '[data-id="' + id + '"] > td:not(.bulk-check-cell)', td => getComputedStyle(td).backgroundColor);
  expect(await bg(M.ids[0])).toBe(tint);
  expect(await bg(M.ids[1])).not.toBe(tint);
  /* a tap anywhere on the row ticks it too (select mode) */
  await page.locator(rows + '[data-id="' + M.ids[1] + '"] td.lcol-title').click();
  await expect(box(page, M.ids[1])).toBeChecked();
  expect((await marked(page, rows)).sort()).toEqual([M.ids[0], M.ids[1]].sort());
  /* unticked: the class goes */
  await box(page, M.ids[0]).uncheck();
  expect(await marked(page, rows)).toEqual([M.ids[1]]);
  expect(await bg(M.ids[0])).not.toBe(tint);
  /* a redraw draws the rows again from what is selected */
  await page.evaluate(() => renderScreen(false));
  expect(await marked(page, rows)).toEqual([M.ids[1]]);
  await page.locator("#bulkBar").getByRole("button", { name: "Select all" }).click();
  expect((await marked(page, rows)).sort()).toEqual(M.ids.slice().sort());
  for (const id of M.ids) expect(await bg(id)).toBe(tint);
  /* leaving select mode takes every mark away */
  await page.evaluate(() => bulkToggle());
  await expect(page.locator("#content .bulk-selected")).toHaveCount(0);
  /* no :has() on a ticked box is left in the page's styles */
  expect(await page.evaluate(() => { const out = []; const walk = l => { for (const r of l) { if (r.selectorText && /:has\([^)]*:checked/.test(r.selectorText) && /bulk/.test(r.selectorText)) out.push(r.selectorText); else if (r.cssRules) walk(r.cssRules); } }; for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (e) {} } return out; })).toEqual([]);
});

test("Kanban: a ticked card is ringed with the accent, an unticked one is not", async ({ page }) => {
  await signIn(page); await view(page, "kanban");
  const cards = "#content .kcard[data-id]";
  await expect(page.locator(cards)).toHaveCount(3);
  await box(page, M.ids[2]).check();
  expect(await marked(page, cards)).toEqual([M.ids[2]]);
  const ring = id => page.$eval(cards + '[data-id="' + id + '"]', c => getComputedStyle(c).boxShadow);
  const accent = await page.evaluate(() => { const p = document.createElement("div"); p.style.color = "var(--color-primary)"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; });
  expect(await ring(M.ids[2])).toBe(accent + " 0px 0px 0px 2px");
  expect(await ring(M.ids[0])).not.toContain("0px 0px 0px 2px");
  await box(page, M.ids[2]).uncheck();
  expect(await marked(page, cards)).toEqual([]);
  await page.evaluate(() => bulkToggle());
});

test("a project's List tab and a phone's List cards: the row is tinted as one card, its cells left clear", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.evaluate(() => { S.taskScope = "all"; S.group = ""; S.filters = emptyTaskFilters(); ENH.bulk = false; });
  await page.evaluate(pid => { S.projectTab = "list"; go("projects", pid); bulkToggle(); }, M.pid);
  const rows = "#content .lcol-tbl tbody tr[data-id]";
  await expect(page.locator(rows)).toHaveCount(3);
  await page.evaluate(id => { const c = document.querySelector('#content .bulk-check input[data-bulk-id="' + id + '"]'); c.click(); }, M.ids[0]);
  expect(await marked(page, rows)).toEqual([M.ids[0]]);
  const tint = await soft(page);
  const st = id => page.$eval(rows + '[data-id="' + id + '"]', tr => ({ tr: getComputedStyle(tr).backgroundColor, td: getComputedStyle(tr.querySelector("td.lcol-title") || tr.querySelector("td:not(.bulk-check-cell)")).backgroundColor }));
  expect(await st(M.ids[0])).toEqual({ tr: tint, td: "rgba(0, 0, 0, 0)" });
  expect((await st(M.ids[1])).tr).not.toBe(tint);
  await page.evaluate(() => bulkToggle());
  await expect(page.locator("#content .bulk-selected")).toHaveCount(0);
});
