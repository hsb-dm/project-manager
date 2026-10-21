/* The task views draw only what can be seen (src/tasks.js, DRAWING ONLY WHAT CAN BE SEEN): the List and the Grid their
   first 100 rows (each group its first 100), a Kanban column its first 30 cards, a Timeline project its first 30 tasks;
   "Show N more" puts the next ones in where they belong without drawing the screen again, and how many are shown is
   kept through any redraw (and a refresh) for that view, sort, filter and group. Counts stay the full numbers; Select
   all takes every task the view holds; drag-and-drop works as before; a task beyond the first 100 opens from a link,
   search or a notification; the Timeline's day grid is drawn once, behind its rows, and lines up with the bars.
   230 tasks (205 in one stage, 25 in the next, all in one project) are made through the API and removed after. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, path) {
  await page.goto(path || "/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
test.use({ viewport: { width: 1680, height: 900 } });   /* each row on one line, as list-columns.spec.js has them */
/* in view before a drag starts: a page that scrolls while an HTML5 drag is on loses the drag */
const center = loc => loc.evaluate(e => e.scrollIntoView({ block: "center" }));
const TAG = "vpg" + Date.now().toString(36), NA = 205, NB = 25;
let M = null;   /* { pid, ids (in the order made), a, b (the two stages) } */
const show = (page, view, o) => page.evaluate(([v, tag, o]) => { UI_LANG = o.lang || "en"; S.taskScope = "all"; S.taskView = v; S.sort = o.sort || "manual"; S.sortDir = 1; S.group = o.group || ""; S.filters = Object.assign(emptyTaskFilters(), { tag }); closeDrawer(); if (S.screen !== "tasks") go("tasks"); else renderScreen(false); }, [view, TAG, o || {}]);
const listRows = page => page.$$eval("#content .lcol-tbl tbody tr[data-id]", r => r.map(x => x.getAttribute("data-id")));
/* the ids drawn in each group of a grouped table, and its "show more" row's words */
const groups = (page, sel) => page.evaluate(s => { const out = {}; let cur = null; document.querySelectorAll(s + " tbody > tr").forEach(tr => { if (tr.classList.contains("grp")) { cur = out[tr.getAttribute("data-group") || tr.textContent.trim()] = { count: tr.querySelector(".cnt").textContent, ids: [], more: null }; } else if (tr.classList.contains("vpage-row")) cur.more = tr.querySelector(".vpage-n").textContent + " | " + tr.querySelector(".vpage-btn").textContent; else if (tr.hasAttribute("data-id")) cur.ids.push(tr.getAttribute("data-id")); }); return out; }, sel);
const order = page => page.evaluate(() => sortedTasks(filteredTasks()).map(t => t.id));
/* put a task back in a stage, and wait for the server to have it */
async function backTo(page, id, st) {
  await page.evaluate(([i, s]) => new Promise(r => task(i).status === s ? r() : setStatus(i, s, r)), [id, st]);
  await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.find(x => x.id === i).status), id)).toBe(st);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180000);
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async ([tag, na, nb]) => {
    const st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), pid = "pvpg" + tag;
    await apiFetch("POST", "/api/projects", { id: pid, name: "Paging " + tag, status: "active", owner: ME, startDate: iso(-10), dueDate: iso(25) });
    const ids = new Array(na + nb); let k = 0;
    /* one at a time per lane, six lanes: the manual order is the order made, near enough */
    await Promise.all(Array.from({ length: 6 }, async () => { while (k < ids.length) { const i = k++;
      ids[i] = (await apiFetch("POST", "/api/tasks", { title: "Paging " + String(i + 1).padStart(3, "0") + " " + tag, status: i < na ? st[0] : st[1], prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], tags: [tag], proj: pid, startDate: iso(1), dueDate: iso(4) })).id; } }));
    return { pid, ids, a: st[0], b: st[1] };
  }, [TAG, NA, NB]);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => { let k = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (k < m.ids.length) { const id = m.ids[k++]; await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); } })); await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {}); }, M);
  await page.close();
});

test("List: 100 rows, then Show 100 more puts the next ones in place; counts stay full; a redraw and a refresh keep them; in Indonesian too", async ({ page }) => {
  await signIn(page);
  await show(page, "list");
  await expect(page.locator("#content .task-pagehead .muted")).toContainText("230 tasks");
  const all = await order(page);
  expect(all.length).toBe(230);
  expect(await listRows(page), "the first 100 of the whole list, in its order").toEqual(all.slice(0, 100));
  const more = page.locator("#content .lcol-tbl tr.vpage-row");
  await expect(more).toHaveCount(1);
  await expect(more.locator(".vpage-n")).toHaveText("100 of 230 shown");
  await expect(more.locator(".vpage-btn")).toHaveText("Show 100 more");
  expect(await more.locator("td").getAttribute("colspan"), "the row spans every column").toBe(String(2 + 11));
  /* in place: the same table and the same first rows, no redraw */
  await page.evaluate(() => { window.__tbl = document.querySelector("#content .lcol-tbl"); window.__first = document.querySelector("#content .lcol-tbl tbody tr[data-id]"); window.__draws = 0; const mo = new MutationObserver(r => r.forEach(m => m.removedNodes.forEach(n => { if (n.nodeType === 1 && n.matches("tr[data-id]")) window.__draws++; }))); mo.observe(document.getElementById("content"), { childList: true, subtree: true }); window.__mo = mo; });
  await more.locator(".vpage-btn").click();
  expect(await listRows(page)).toEqual(all.slice(0, 200));
  expect(await page.evaluate(() => [document.querySelector("#content .lcol-tbl") === window.__tbl, document.querySelector("#content .lcol-tbl tbody tr[data-id]") === window.__first, window.__draws])).toEqual([true, true, 0]);
  await expect(more.locator(".vpage-n")).toHaveText("200 of 230 shown");
  await expect(more.locator(".vpage-btn")).toHaveText("Show 30 more");
  expect(await page.evaluate(() => document.activeElement.classList.contains("vpage-btn")), "the focus stays on the button").toBe(true);
  /* the keyboard: Enter on the button; the last page takes the row away and the focus goes to the first row it added */
  await page.keyboard.press("Enter");
  expect(await listRows(page)).toEqual(all);
  await expect(more).toHaveCount(0);
  expect(await page.evaluate(id => document.activeElement.closest("tr") && document.activeElement.closest("tr").getAttribute("data-id"), all[200])).toBe(all[200]);
  await page.evaluate(() => window.__mo.disconnect());
  await expect(page.locator("#content .task-pagehead .muted")).toContainText("230 tasks");
  /* a full redraw draws as many again; another sort starts at its first page, and coming back finds them again */
  await page.evaluate(() => renderScreen(false));
  expect((await listRows(page)).length).toBe(230);
  await page.evaluate(() => { S.sort = "due"; renderScreen(false); });
  expect((await listRows(page)).length).toBe(100);
  await page.evaluate(() => { S.sort = "manual"; renderScreen(false); });
  expect((await listRows(page)).length).toBe(230);
  /* the browser's Print draws every row first, and does not keep that */
  await page.evaluate(() => { S.sort = "prio"; renderScreen(false); window.dispatchEvent(new Event("beforeprint")); });
  expect((await listRows(page)).length).toBe(230);
  await expect(more).toHaveCount(0);
  await page.evaluate(() => renderScreen(false));
  expect((await listRows(page)).length).toBe(100);
  await page.evaluate(() => { S.sort = "manual"; renderScreen(false); });
  /* a refresh puts the page back as it was, the rows shown too */
  await page.reload(); await ready(page);
  await expect.poll(() => listRows(page).then(r => r.length)).toBe(230);
  /* Indonesian */
  await show(page, "list", { sort: "prio", lang: "id" });
  await expect(more.locator(".vpage-btn")).toHaveText("Tampilkan 100 lagi");
  await expect(more.locator(".vpage-n")).toHaveText("100 dari 230 tampil");
  await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
});

test("List grouped: each group draws its first 100, its header keeps the full count; Show more in one group leaves the others", async ({ page }) => {
  await signIn(page);
  await show(page, "list", { group: "status" });
  let g = await groups(page, "#content .lcol-tbl");
  expect(g[M.a].count).toBe("205"); expect(g[M.a].ids.length).toBe(100); expect(g[M.a].more).toBe("100 of 205 shown | Show 100 more");
  expect(g[M.b].count).toBe("25"); expect(g[M.b].ids.length).toBe(25); expect(g[M.b].more).toBe(null);
  const inA = await page.evaluate(a => groupedTasks(sortedTasks(filteredTasks()), "status").find(x => x.key === a).tasks.map(t => t.id), M.a);
  expect(g[M.a].ids).toEqual(inA.slice(0, 100));
  await page.locator('#content .lcol-tbl tr.vpage-row .vpage-btn').click();
  g = await groups(page, "#content .lcol-tbl");
  expect(g[M.a].ids).toEqual(inA.slice(0, 200)); expect(g[M.a].more).toBe("200 of 205 shown | Show 5 more");
  expect(g[M.b].ids.length).toBe(25);
  await expect(page.locator("#content .task-pagehead .muted")).toContainText("230 tasks");
  /* the group is kept apart from the ungrouped List */
  await page.evaluate(() => { S.group = ""; renderScreen(false); });
  expect((await listRows(page)).length).toBe(100);
  await page.evaluate(() => { S.group = "status"; renderScreen(false); });
  expect((await groups(page, "#content .lcol-tbl"))[M.a].ids.length).toBe(200);
});

test("select mode: Select all takes every task the List holds, not only the 100 drawn; rows added later come ticked; the check column still works", async ({ page }) => {
  await signIn(page);
  await show(page, "list");
  await page.evaluate(() => bulkToggle());
  await expect(page.locator("#content .lcol-tbl tbody tr[data-id] .bulk-check input")).toHaveCount(100);
  await page.locator("#bulkBar").getByRole("button", { name: "Select all" }).click();
  await expect(page.locator("#bulkBar b")).toHaveText("230 selected");
  expect(await page.evaluate(ids => ids.every(id => ENH.bulkSel[id]), M.ids)).toBe(true);
  await page.locator("#content .lcol-tbl tr.vpage-row .vpage-btn").click();
  await expect(page.locator("#content .lcol-tbl tbody tr[data-id] .bulk-check input")).toHaveCount(200);
  await expect(page.locator("#content .lcol-tbl tbody tr[data-id] .bulk-check input:checked")).toHaveCount(200);
  await expect(page.locator("#bulkBar b")).toHaveText("230 selected");
  await page.evaluate(() => bulkToggle());
  /* the personal tick on a row drawn by Show more is on the task, and a redraw keeps it */
  const row = await page.evaluate(() => sortedTasks(filteredTasks())[150].id);
  await page.locator('#content .lcol-tbl tr[data-id="' + row + '"] .tcheck').click();
  await page.evaluate(() => renderScreen(false));
  await expect(page.locator('#content .lcol-tbl tr[data-id="' + row + '"]')).toHaveClass(/checked/);
  await page.evaluate(id => toggleTaskChecked(id), row);
});

test("drag-and-drop: a row drawn by Show more moves into another group; a drop reads the whole list's order, drawn or not", async ({ page }) => {
  await signIn(page);
  await show(page, "list", { group: "status" });
  await page.locator('#content .lcol-tbl tr.vpage-row .vpage-btn').click();
  const id = (await groups(page, "#content .lcol-tbl"))[M.a].ids[199];   /* drawn by Show more, the last before the next group */
  try {
    await center(page.locator("#content .lcol-tbl tr.vpage-row"));
    await page.locator('#content .lcol-tbl tr[data-id="' + id + '"] td.lcol-tags').dragTo(page.locator('#content .lcol-tbl tr.grp[data-group="' + M.b + '"]'));
    await expect.poll(() => page.evaluate(i => task(i).status, id)).toBe(M.b);
    await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.find(x => x.id === i).status), id)).toBe(M.b);
    const g = await groups(page, "#content .lcol-tbl");
    expect(g[M.a].count).toBe("204"); expect(g[M.a].ids.length, "the redraw keeps what was shown").toBe(200); expect(g[M.b].count).toBe("26");
    expect(g[M.b].ids).toContain(id);
    /* under Manual sort a row drawn by Show more, dropped on another, lands just before it */
    const a1 = g[M.a].ids, mover = a1[150], target = a1[146];
    await center(page.locator('#content .lcol-tbl tr[data-id="' + a1[148] + '"]'));
    await page.locator('#content .lcol-tbl tr[data-id="' + mover + '"] td.lcol-tags').dragTo(page.locator('#content .lcol-tbl tr[data-id="' + target + '"] td.lcol-proj'));
    await expect.poll(() => groups(page, "#content .lcol-tbl").then(x => x[M.a].ids.slice(145, 148))).toEqual([a1[145], mover, target]);
    /* dropped on the first row of the next group: the task before it is the last of the group above, which is not drawn
       (only its first 200 are), as it was with every row drawn — the whole list's order, not the rows drawn */
    const g2 = await groups(page, "#content .lcol-tbl"), first = g2[M.b].ids[0], other = g2[M.b].ids[5];
    const lastOfA = await page.evaluate(a => groupedTasks(sortedTasks(filteredTasks()), "status").find(x => x.key === a).tasks.slice(-1)[0].id, M.a);
    expect(g2[M.a].ids).not.toContain(lastOfA);
    await center(page.locator('#content .lcol-tbl tr[data-id="' + g2[M.b].ids[3] + '"]'));
    await page.evaluate(() => { const base = moveTask; window.__ops = []; moveTask = function (tk, op) { window.__ops.push(Object.assign({ id: tk.id }, op)); return base.apply(this, arguments); }; window.__unmove = () => { moveTask = base; }; });
    await page.locator('#content .lcol-tbl tr[data-id="' + other + '"] td.lcol-tags').dragTo(page.locator('#content .lcol-tbl tr[data-id="' + first + '"] td.lcol-proj'));
    await expect.poll(() => page.evaluate(() => window.__ops.length)).toBe(1);
    expect(await page.evaluate(() => window.__ops[0])).toMatchObject({ id: other, type: "REORDER_TASK", afterTaskId: lastOfA, beforeTaskId: first });
    await page.evaluate(() => window.__unmove());
  } finally {
    await backTo(page, id, M.a);
  }
});

test("Kanban: 30 cards a column, Show 30 more adds them in place; a card dropped on a long column's free space lands where it can be seen", async ({ page }) => {
  await signIn(page);
  await show(page, "kanban");
  const colA = page.locator('#content .kcol[data-status="' + M.a + '"]'), colB = page.locator('#content .kcol[data-status="' + M.b + '"]');
  await expect(colA.locator(".kcol-head .cnt")).toHaveText("205");
  await expect(colA.locator(".kcard[data-id]")).toHaveCount(30);
  await expect(colA.locator(".vpage-n")).toHaveText("30 of 205 shown");
  await expect(colA.locator(".vpage-btn")).toHaveText("Show 30 more");
  await expect(colB.locator(".kcard[data-id]")).toHaveCount(25); await expect(colB.locator(".vpage")).toHaveCount(0);
  const inA = await page.evaluate(a => sortedTasks(filteredTasks().filter(t => t.status === a)).map(t => t.id), M.a);
  expect(await colA.locator(".kcard[data-id]").evaluateAll(c => c.map(x => x.getAttribute("data-id")))).toEqual(inA.slice(0, 30));
  await page.evaluate(() => { window.__col = document.querySelector("#content .kcol .kcol-body"); });
  await colA.locator(".vpage-btn").click();
  expect(await colA.locator(".kcard[data-id]").evaluateAll(c => c.map(x => x.getAttribute("data-id")))).toEqual(inA.slice(0, 60));
  expect(await page.evaluate(() => document.querySelector("#content .kcol .kcol-body") === window.__col)).toBe(true);
  await expect(colA.locator(".vpage-n")).toHaveText("60 of 205 shown");
  await page.evaluate(() => renderScreen(false));
  await expect(colA.locator(".kcard[data-id]")).toHaveCount(60);
  /* a card from the short column dropped on the long one's free space: after the 60th, and drawn */
  const card = (await colB.locator(".kcard[data-id]").evaluateAll(c => c.map(x => x.getAttribute("data-id"))))[3];
  try {
    await center(colA.locator(".vpage-n"));
    await colB.locator('.kcard[data-id="' + card + '"]').dragTo(colA.locator(".vpage-n"));
    await expect.poll(() => page.evaluate(i => task(i).status, card)).toBe(M.a);
    await expect(colA.locator('.kcard[data-id="' + card + '"]'), "the card is drawn where it was dropped").toHaveCount(1);
    expect(await colA.locator(".kcard[data-id]").evaluateAll(c => c.map(x => x.getAttribute("data-id")))).toEqual(inA.slice(0, 60).concat([card]));
    await expect(colA.locator(".kcol-head .cnt")).toHaveText("206");
  } finally {
    await backTo(page, card, M.b);
  }
});

test("a task beyond the first 100 opens from a link, from search and from a notification; the List does not grow", async ({ page }) => {
  await signIn(page);
  await show(page, "list");
  const id = (await order(page))[180], title = await page.evaluate(i => task(i).title, id);
  await expect(page.locator('#content .lcol-tbl tr[data-id="' + id + '"]')).toHaveCount(0);
  /* search */
  await page.locator("#searchInput").fill(title);
  await page.locator('#content .row[data-id="' + id + '"]').click();
  await expect(page.locator("#drawer .dr-title")).toHaveText(title);
  await page.evaluate(() => { closeDrawer(); const i = document.getElementById("searchInput"); i.value = ""; onSearch(""); });
  /* a notification */
  await show(page, "list");
  await page.evaluate(i => { NOTIFS.unshift({ id: "nt-vpg", k: "assigned", who: ME, t: i, ago: 0, read: false, createdAt: new Date().toISOString() }); renderNotifs(); }, id);
  await page.locator("#notifBtn").click();
  await page.locator('#notifList .notif[onclick*="' + id + '"]').first().click();
  await expect(page.locator("#drawer .dr-title")).toHaveText(title);
  expect((await listRows(page)).length).toBe(100);
  await page.evaluate(() => { NOTIFS = NOTIFS.filter(n => n.id !== "nt-vpg"); closePops(); closeDrawer(); });
  /* a link */
  await page.goto("/tasks?task=" + id); await ready(page);
  await expect(page.locator("#drawer .dr-title")).toHaveText(title);
  await show(page, "list");
  await page.evaluate(i => openTask(i), id);
  await expect(page.locator("#drawer .dr-title")).toHaveText(title);
  expect((await listRows(page)).length).toBe(100);
});

test("Grid: 100 rows a page, Show 100 more adds them, and a cell in an added row edits its task", async ({ page }) => {
  /* 200 Grid rows hold 1,000 selects, and the form-label observer (src/v29.js) checks every one after each change:
     on a busy machine a redraw here takes seconds, so the waits are long */
  test.setTimeout(150000);
  await signIn(page);
  await show(page, "grid");
  const rows = () => page.$$eval("#content table.gridv tbody tr[data-id]", r => r.map(x => x.getAttribute("data-id")));
  const all = await order(page);
  expect(await rows()).toEqual(all.slice(0, 100));
  const more = page.locator("#content table.gridv tr.vpage-row");
  await expect(more.locator(".vpage-n")).toHaveText("100 of 230 shown");
  await more.locator(".vpage-btn").click();
  expect(await rows()).toEqual(all.slice(0, 200));
  const id = all[150];
  try {
    await page.locator('#content table.gridv tr[data-id="' + id + '"] select').filter({ has: page.locator('option[value="urgent"]') }).selectOption("high");
    await expect.poll(() => page.evaluate(i => task(i).prio, id), { timeout: 45000 }).toBe("high");
    expect((await rows()).length, "the redraw after the edit keeps the rows shown").toBe(200);
  } finally {
    await page.evaluate(i => setPrio(i, "medium"), id);
    await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.find(x => x.id === i).prio), id), { timeout: 45000 }).toBe("medium");
  }
  /* grouped, each group its first 100 */
  await show(page, "grid", { group: "status" });
  const g = await groups(page, "#content table.gridv");
  const keys = Object.keys(g), big = keys.find(k => g[k].count === "205");
  expect(g[big].ids.length).toBe(100); expect(g[big].more).toBe("100 of 205 shown | Show 100 more");
});

test("Timeline: a project's first 30 tasks, then Show 30 more; the day grid is drawn once, behind the rows, and lines up with the bars", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 860 });   /* narrower than the 42 days at their least: the timeline scrolls sideways */
  await signIn(page);
  await show(page, "timeline");
  const grid = page.locator("#content #tlGrid");
  expect(await page.evaluate(() => { const w = document.querySelector("#content .tlw"); return w.scrollWidth > w.clientWidth; })).toBe(true);
  const drawn = () => grid.locator(".tl-row[data-id]").evaluateAll(r => r.map(x => x.getAttribute("data-id")));
  const inP = await page.evaluate(() => sortedTasks(filteredTasks()).map(t => t.id));
  expect(await drawn()).toEqual(inP.slice(0, 30));
  const more = grid.locator(".tl-row.vpage-tl");
  await expect(more.locator(".vpage-n")).toHaveText("30 of 230 shown");
  await expect(more.locator(".vpage-btn")).toHaveText("Show 30 more");
  await more.locator(".vpage-btn").click();
  expect(await drawn()).toEqual(inP.slice(0, 60));
  await expect(more.locator(".vpage-n")).toHaveText("60 of 230 shown");
  /* the day grid: 42 columns once, none in a task's row; a project's own row keeps its cells */
  await expect(grid.locator(".tl-days > i")).toHaveCount(42);
  await expect(grid.locator(".tl-row[data-id] .tl-cell")).toHaveCount(0);
  await expect(grid.locator(".tl-row.group .tl-cell")).toHaveCount(42);
  const geo = await page.evaluate(() => {
    const g = document.getElementById("tlGrid"), days = [...g.querySelectorAll(".tl-days > i")], head = [...g.querySelectorAll(".tl-hd > div")].slice(1);
    const row = g.querySelector(".tl-row[data-id]"), bar = row.querySelector(".tl-bar"), t = task(row.getAttribute("data-id")), first = (t.due - t.span) - TL.from;
    const proj = [...g.querySelector(".tl-row.group").querySelectorAll(".tl-cell")];
    return { head: head.map((h, i) => Math.abs(h.getBoundingClientRect().right - days[i].getBoundingClientRect().right)).reduce((a, b) => Math.max(a, b), 0),
      cells: proj.map((c, i) => Math.abs(c.getBoundingClientRect().left - days[i].getBoundingClientRect().left)).reduce((a, b) => Math.max(a, b), 0),
      bar: Math.abs(bar.getBoundingClientRect().left - 2 - days[first].getBoundingClientRect().left), rowW: row.getBoundingClientRect().width, gridW: g.getBoundingClientRect().width,
      we: days.map(d => d.classList.contains("we")).join(""), weHead: Array.from({ length: TL.days }, (_, i) => { const d = dateOf(TL.from + i); return d.getDay() === 0 || d.getDay() === 6; }).join(""),
      z: getComputedStyle(g.querySelector(".tl-days")).zIndex, isolated: getComputedStyle(g).isolation };
  });
  expect(geo.head, "each day column lines up with its header").toBeLessThan(1);
  expect(geo.cells, "and with a project row's cells").toBeLessThan(1);
  expect(geo.bar, "a bar starts at its first day").toBeLessThan(1);
  expect(Math.abs(geo.rowW - geo.gridW), "the grid is as wide as its rows").toBeLessThan(1);
  expect(geo.we).toBe(geo.weHead);
  expect([geo.z, geo.isolated]).toEqual(["-1", "isolate"]);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the List's cards: 100, then a plain Show more line that adds the next ones; nothing scrolls sideways", async ({ page }) => {
    await signIn(page);
    await show(page, "list");
    await expect(page.locator("#content .lcol-tbl tbody tr[data-id]")).toHaveCount(100);
    const more = page.locator("#content .lcol-tbl tr.vpage-row");
    await more.scrollIntoViewIfNeeded();
    await expect(more.locator(".vpage-btn")).toBeVisible();
    const box = await page.evaluate(() => { const r = document.querySelector("#content .lcol-tbl tr.vpage-row"), b = r.getBoundingClientRect(), c = document.querySelector("#content .lcol-tbl tbody tr[data-id]").getBoundingClientRect(); return { display: getComputedStyle(r).display, w: Math.round(b.width), cw: Math.round(c.width), sw: document.documentElement.scrollWidth, vw: innerWidth }; });
    expect(box.display).toBe("block"); expect(box.w).toBe(box.cw); expect(box.sw).toBeLessThanOrEqual(box.vw);
    await more.locator(".vpage-btn").tap();
    await expect(page.locator("#content .lcol-tbl tbody tr[data-id]")).toHaveCount(200);
  });
});
