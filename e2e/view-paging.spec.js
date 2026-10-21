/* The task views draw only what can be seen (src/tasks.js, DRAWING ONLY WHAT CAN BE SEEN). The List and the Grid
   show a page at a time — 100 rows, or 25 of each group when grouped, each group paging on its own — with a pager
   under the rows: "‹ Prev", the page numbers with a "…" for those skipped, "Next ›" and "1–100 of 235". A page change
   draws only that table's or group's rows, keeps the focus on the pager and brings the top of the group or the table
   into sight; the page is kept through any redraw and a refresh for that view, sort, filter and group, goes back to 1
   when one of them changes, and becomes the last when the tasks are fewer. A Kanban column draws its first 30 cards
   and a Timeline project its first 30 tasks, then "Show 30 more". Counts stay the full numbers; Select all takes every
   task the view holds; drag-and-drop works as before; Print prints every row; a task on another page opens from a
   link, search or a notification; the Timeline's day grid is drawn once, behind its rows, and lines up with the bars.
   235 tasks (205 in one stage, 30 in the next, all in one project) are made through the API and removed after. */
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
const TAG = "vpg" + Date.now().toString(36), NA = 205, NB = 30, N = NA + NB;
let M = null;   /* { pid, ids (in the order made), a, b (the two stages), an, bn (their names) } */
const show = (page, view, o) => page.evaluate(([v, tag, o]) => { UI_LANG = o.lang || "en"; S.taskScope = "all"; S.taskView = v; S.sort = o.sort || "manual"; S.sortDir = 1; S.group = o.group || ""; S.filters = Object.assign(emptyTaskFilters(), { tag }); closeDrawer(); if (S.screen !== "tasks") go("tasks"); else renderScreen(false); }, [view, TAG, o || {}]);
const listRows = page => page.$$eval("#content .lcol-tbl tbody tr[data-id]", r => r.map(x => x.getAttribute("data-id")));
/* the ids drawn in each group of a grouped table, its header's count and its pager (range, numbers, the page shown) */
const groups = (page, sel) => page.evaluate(s => { const out = {}; let cur = null; document.querySelectorAll(s + " tbody > tr").forEach(tr => {
  if (tr.classList.contains("grp")) cur = out[tr.getAttribute("data-group")] = { count: tr.querySelector(".cnt").textContent, ids: [], range: null, nums: null, on: null, first: null };
  else if (tr.classList.contains("vpager-row")) { cur.range = tr.querySelector(".vpager-range").textContent; cur.nums = [...tr.querySelectorAll(".vpager-num")].map(b => b.textContent).join(" "); cur.on = tr.querySelector('.vpager-num[aria-current="page"]').textContent; }
  else if (tr.hasAttribute("data-id")) cur.ids.push(tr.getAttribute("data-id")); }); return out; }, sel);
const order = page => page.evaluate(() => sortedTasks(filteredTasks()).map(t => t.id));
const inGroup = (page, key) => page.evaluate(k => groupedTasks(sortedTasks(filteredTasks()), "status").find(x => x.key === k).tasks.map(t => t.id), key);
/* a pager: the table's (List or Grid), or a group's by its name */
const pagerOf = (page, name, tbl) => page.locator("#content " + (tbl || ".lcol-tbl") + " tr.vpager-row nav.vpager" + (name ? '[aria-label="Pages: ' + name + '"]' : ""));
const pageBtn = (pager, n) => pager.getByRole("button", { name: "Page " + n, exact: true });
const nums = pager => pager.locator(".vpager-num").evaluateAll(b => b.map(x => x.textContent).join(" "));
const focused = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.classList.contains("vpager-prev") ? "prev" : a.classList.contains("vpager-next") ? "next" : a.classList.contains("vpager-num") ? "page " + a.textContent + (a.getAttribute("aria-current") ? " (shown)" : "") : a.tagName) : null; });
/* the top of the element is in sight in the page's scroller (and under the Grid's sticky header, in its own box) */
const topInSight = (page, sel) => page.evaluate(s => { const el = document.querySelector(s), r = el.getBoundingClientRect(), sc = appScrollEl().getBoundingClientRect(); return r.top >= sc.top - 1 && r.top <= Math.min(sc.bottom, innerHeight) - 40; }, sel);
/* put a task in a stage, and wait for the server to have it */
async function moveTo(page, id, st) {
  await page.evaluate(([i, s]) => new Promise(r => task(i).status === s ? r() : setStatus(i, s, r)), [id, st]);
  await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.find(x => x.id === i).status), id)).toBe(st);
}
const backTo = moveTo;

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
    return { pid, ids, a: st[0], b: st[1], an: stageName(st[0]), bn: stageName(st[1]) };
  }, [TAG, NA, NB]);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => { let k = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (k < m.ids.length) { const id = m.ids[k++]; await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); } })); await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {}); }, M);
  await page.close();
});

test("List: 100 rows a page; Next, Prev, a page number and the keyboard draw only the table's rows, the focus stays on the pager, the table's top comes into sight; a redraw and a refresh keep the page", async ({ page }) => {
  await signIn(page);
  await show(page, "list");
  await expect(page.locator("#content .task-pagehead .muted")).toContainText(N + " tasks");
  const all = await order(page);
  expect(all.length).toBe(N);
  expect(await listRows(page), "the first 100 of the whole list, in its order").toEqual(all.slice(0, 100));
  const row = page.locator("#content .lcol-tbl tr.vpager-row"), pg = pagerOf(page);
  await expect(row).toHaveCount(1);
  expect(await row.locator("td").getAttribute("colspan"), "the pager's row spans every column").toBe(String(2 + 11));
  await expect(pg).toHaveAttribute("aria-label", "Pages");
  await expect(pg.locator(".vpager-range")).toHaveText("1–100 of 235");
  expect(await nums(pg)).toBe("1 2 3");
  await expect(pageBtn(pg, 1)).toHaveAttribute("aria-current", "page");
  await expect(pg.locator(".vpager-prev")).toBeDisabled(); await expect(pg.locator(".vpager-next")).toBeEnabled();
  await expect(pg.locator(".vpager-prev")).toHaveText("‹Prev"); await expect(pg.locator(".vpager-next")).toHaveText("Next›");
  /* in place: the same table and the same page around it; nothing but the rows (and the pager's numbers) is taken out */
  await page.evaluate(() => { window.__tbl = document.querySelector("#content .lcol-tbl"); window.__head = document.querySelector("#content .task-pagehead"); window.__bar = document.querySelector("#content .task-filter-toolbar"); window.__other = 0;
    const mo = new MutationObserver(r => r.forEach(m => m.removedNodes.forEach(n => { if (n.nodeType === 1 && !n.matches("tr[data-id]") && !(m.target.closest && m.target.closest(".vpager-nums"))) window.__other++; })));
    mo.observe(document.getElementById("content"), { childList: true, subtree: true }); window.__mo = mo; });
  await pg.locator(".vpager-next").click();
  expect(await listRows(page)).toEqual(all.slice(100, 200));
  expect(await page.evaluate(() => [document.querySelector("#content .lcol-tbl") === window.__tbl, document.querySelector("#content .task-pagehead") === window.__head, document.querySelector("#content .task-filter-toolbar") === window.__bar, window.__other])).toEqual([true, true, true, 0]);
  await expect(pg.locator(".vpager-range")).toHaveText("101–200 of 235");
  await expect(pageBtn(pg, 2)).toHaveAttribute("aria-current", "page");
  await expect(pg.locator(".vpager-prev")).toBeEnabled();
  expect(await focused(page), "the focus stays on Next").toBe("next");
  expect(await topInSight(page, "#content .lcol-tbl"), "the table's top is scrolled into sight").toBe(true);
  /* the keyboard: Enter on Next; on the last page Next is off and the focus goes to the page shown */
  await page.keyboard.press("Enter");
  expect(await listRows(page)).toEqual(all.slice(200));
  await expect(pg.locator(".vpager-range")).toHaveText("201–235 of 235");
  await expect(pg.locator(".vpager-next")).toBeDisabled();
  expect(await focused(page)).toBe("page 3 (shown)");
  /* a page number, then Prev back to the first: Prev is off and the focus is on page 1 */
  await pageBtn(pg, 2).click();
  expect(await listRows(page)).toEqual(all.slice(100, 200));
  await pg.locator(".vpager-prev").click();
  expect(await listRows(page)).toEqual(all.slice(0, 100));
  await expect(pg.locator(".vpager-prev")).toBeDisabled();
  expect(await focused(page)).toBe("page 1 (shown)");
  expect(await page.evaluate(() => window.__other)).toBe(0);
  await page.evaluate(() => window.__mo.disconnect());
  await expect(page.locator("#content .task-pagehead .muted")).toContainText(N + " tasks");
  /* a full redraw draws the same page; a refresh puts it back too */
  await pageBtn(pg, 3).click();
  await page.evaluate(() => renderScreen(false));
  expect(await listRows(page)).toEqual(all.slice(200));
  await page.reload(); await ready(page);
  await expect.poll(() => listRows(page)).toEqual(all.slice(200));
  await expect(pagerOf(page).locator(".vpager-range")).toHaveText("201–235 of 235");
});

test("List: another sort, filter, group or scope goes back to page 1; another view or screen keeps it; Print prints every row; Indonesian; dark mode", async ({ page }) => {
  await signIn(page);
  await show(page, "list");
  const pg = pagerOf(page), range = pg.locator(".vpager-range");
  const toPage2 = async () => { await pageBtn(pagerOf(page), 2).click(); await expect(pagerOf(page).locator(".vpager-range")).toHaveText("101–200 of 235"); };
  await toPage2();
  await page.evaluate(() => { S.sort = "due"; S.sortDir = 1; renderScreen(false); });
  await expect(range).toHaveText("1–100 of 235");
  expect(await listRows(page)).toEqual((await order(page)).slice(0, 100));
  await toPage2();
  await page.evaluate(() => { S.sort = "manual"; renderScreen(false); });
  await expect(range, "the sort changed back is a change too").toHaveText("1–100 of 235");
  await toPage2();
  await page.evaluate(() => setFilter("dependency", "none"));   /* none of them has a dependency: the same 235 */
  await expect(range).toHaveText("1–100 of 235");
  await toPage2();
  await page.evaluate(() => setFilter("dependency", ""));
  await expect(range).toHaveText("1–100 of 235");
  await toPage2();
  await page.evaluate(() => { S.sortDir = -1; renderScreen(false); });
  await expect(range, "the sort reversed").toHaveText("1–100 of 235");
  await page.evaluate(() => { S.sortDir = 1; renderScreen(false); });
  await toPage2();
  await page.evaluate(() => { S.group = "status"; renderScreen(false); });
  await expect(pagerOf(page, M.an).locator(".vpager-range")).toHaveText("1–25 of 205");
  await pageBtn(pagerOf(page, M.an), 3).click();
  await page.evaluate(() => { S.group = ""; renderScreen(false); });
  await expect(range).toHaveText("1–100 of 235");
  await page.evaluate(() => { S.group = "status"; renderScreen(false); });
  await expect(pagerOf(page, M.an).locator(".vpager-range"), "grouping again starts again").toHaveText("1–25 of 205");
  await page.evaluate(() => { S.group = ""; renderScreen(false); });
  await toPage2();
  await page.evaluate(() => { S.taskScope = "mine"; renderScreen(false); });
  await expect(range).toHaveText("1–100 of 235");   /* all of them are the admin's */
  await page.evaluate(() => { S.taskScope = "all"; renderScreen(false); });
  /* the Kanban, Home and back: the List is on its page still */
  await toPage2();
  await page.evaluate(() => { S.taskView = "kanban"; renderScreen(false); });
  await page.evaluate(() => { S.taskView = "list"; renderScreen(false); });
  await expect(range).toHaveText("101–200 of 235");
  await page.evaluate(() => go("home")); await page.evaluate(() => go("tasks"));
  await expect(range).toHaveText("101–200 of 235");
  /* the browser's Print draws every row of every page, without the pager, and the page comes back after */
  const all = await order(page);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  expect(await listRows(page)).toEqual(all);
  await page.emulateMedia({ media: "print" });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("#content tr.vpager-row")).display)).toBe("none");
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  expect(await listRows(page)).toEqual(all.slice(100, 200));
  await expect(range).toHaveText("101–200 of 235");
  /* Indonesian, the numbers written as the language writes them */
  await show(page, "list", { lang: "id" });
  await expect(pg).toHaveAttribute("aria-label", "Halaman");
  await expect(pg.locator(".vpager-prev")).toHaveText("‹Sebelumnya"); await expect(pg.locator(".vpager-next")).toHaveText("Berikutnya›");
  await expect(pg.locator(".vpager-prev")).toHaveAttribute("aria-label", "Halaman sebelumnya"); await expect(pg.locator(".vpager-next")).toHaveAttribute("aria-label", "Halaman berikutnya");
  await expect(pg.getByRole("button", { name: "Halaman 3", exact: true })).toBeVisible();
  await expect(range).toHaveText("101–200 dari 235");
  expect(await page.evaluate(() => { const e = { list: { length: 1526 }, size: 100, page: 16 }, id = vpageRangeText(e); UI_LANG = "en"; return [id, vpageRangeText(e)]; })).toEqual(["1.501–1.526 dari 1.526", "1,501–1,526 of 1,526"]);
  await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
  /* dark mode: the page shown stands out and every number reads */
  try {
    await page.evaluate(() => setAppearance("dark"));
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const look = await page.evaluate(() => {
      const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number), lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 10) / 10; };
      const panel = getComputedStyle(document.querySelector("#content .panel")).backgroundColor, on = getComputedStyle(document.querySelector("#content .vpager-num.on")), other = getComputedStyle(document.querySelector("#content .vpager-num:not(.on)")), r = getComputedStyle(document.querySelector("#content .vpager-range"));
      return { on: ratio(on.color, on.backgroundColor), onPanel: ratio(on.backgroundColor, panel), other: ratio(other.color, panel), range: ratio(r.color, panel) };
    });
    expect(look.on, "the page shown: its number on its mark").toBeGreaterThan(7);
    expect(look.onPanel, "its mark against the panel").toBeGreaterThan(3);
    expect(look.other, "another page's number").toBeGreaterThan(4.5);
    expect(look.range, "the range line").toBeGreaterThan(4.5);
  } finally {
    await page.evaluate(() => setAppearance("light"));
  }
});

test("List grouped: 25 rows a group, each group paging on its own, the headers keeping their full counts; a … goes to the middle of the pages it stands for", async ({ page }) => {
  await signIn(page);
  await show(page, "list", { group: "status" });
  const inA = await inGroup(page, M.a), inB = await inGroup(page, M.b);
  let g = await groups(page, "#content .lcol-tbl");
  expect(Object.keys(g)).toEqual([M.a, M.b]);
  expect(g[M.a]).toMatchObject({ count: "205", ids: inA.slice(0, 25), range: "1–25 of 205", nums: "1 2 3 4 5 … 9", on: "1" });
  expect(g[M.b]).toMatchObject({ count: "30", ids: inB.slice(0, 25), range: "1–25 of 30", nums: "1 2", on: "1" });
  const pa = pagerOf(page, M.an), pb = pagerOf(page, M.bn);
  /* one group pages; the other's rows are not drawn again */
  await page.evaluate(() => { window.__a0 = document.querySelector("#content .lcol-tbl tbody tr[data-id]"); });
  await pb.locator(".vpager-next").click();
  g = await groups(page, "#content .lcol-tbl");
  expect(g[M.b]).toMatchObject({ count: "30", ids: inB.slice(25), range: "26–30 of 30", on: "2" });
  expect(g[M.a]).toMatchObject({ ids: inA.slice(0, 25), on: "1" });
  expect(await page.evaluate(() => document.querySelector("#content .lcol-tbl tbody tr[data-id]") === window.__a0)).toBe(true);
  expect(await topInSight(page, '#content .lcol-tbl tr.grp[data-group="' + M.b + '"]'), "the group's header is scrolled into sight").toBe(true);
  /* the … after 5 stands for 6–8 and goes to 7 */
  const gap = pa.locator(".vpager-gap");
  await expect(gap).toHaveCount(1);
  await expect(gap).toHaveAttribute("aria-label", "Pages 6–8: go to page 7");
  await gap.click();
  g = await groups(page, "#content .lcol-tbl");
  expect(g[M.a]).toMatchObject({ count: "205", ids: inA.slice(150, 175), range: "151–175 of 205", nums: "1 … 5 6 7 8 9", on: "7" });
  expect(g[M.b]).toMatchObject({ on: "2", ids: inB.slice(25) });
  expect(await focused(page), "the focus on the page now shown").toBe("page 7 (shown)");
  expect(await topInSight(page, '#content .lcol-tbl tr.grp[data-group="' + M.a + '"]')).toBe(true);
  /* the last page, then the … before 5 (2–4) goes to 3 */
  await pageBtn(pa, 9).click();
  g = await groups(page, "#content .lcol-tbl");
  expect(g[M.a]).toMatchObject({ ids: inA.slice(200), range: "201–205 of 205", on: "9" });
  await expect(pa.locator(".vpager-next")).toBeDisabled();
  await expect(pa.locator(".vpager-gap")).toHaveAttribute("aria-label", "Pages 2–4: go to page 3");
  await pa.locator(".vpager-gap").click();
  g = await groups(page, "#content .lcol-tbl");
  expect(g[M.a]).toMatchObject({ ids: inA.slice(50, 75), range: "51–75 of 205", nums: "1 2 3 4 5 … 9", on: "3" });
  /* the counts are the groups' and the page's, in full */
  expect([g[M.a].count, g[M.b].count]).toEqual(["205", "30"]);
  await expect(page.locator("#content .task-pagehead .muted")).toContainText(N + " tasks");
  /* a redraw draws each group's page again */
  await page.evaluate(() => renderScreen(false));
  g = await groups(page, "#content .lcol-tbl");
  expect([g[M.a].on, g[M.b].on, g[M.a].ids[0], g[M.b].ids[0]]).toEqual(["3", "2", inA[50], inB[25]]);
});

test("fewer tasks than the page shown needs: the group shows its last page, and stays there when they come back", async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  await show(page, "list", { group: "status" });
  const inA = await inGroup(page, M.a), moved = inA.slice(0, 6);
  await pageBtn(pagerOf(page, M.an), 9).click();
  expect((await groups(page, "#content .lcol-tbl"))[M.a]).toMatchObject({ range: "201–205 of 205", on: "9" });
  try {
    for (const id of moved) await moveTo(page, id, M.b);
    await expect.poll(() => groups(page, "#content .lcol-tbl").then(g => g[M.a].count)).toBe("199");
    const g = await groups(page, "#content .lcol-tbl"), nowA = await inGroup(page, M.a);
    expect(g[M.a]).toMatchObject({ count: "199", ids: nowA.slice(175), range: "176–199 of 199", nums: "1 … 4 5 6 7 8", on: "8" });
    expect(g[M.b]).toMatchObject({ count: "36", on: "1" });
  } finally {
    for (const id of moved) await backTo(page, id, M.a);
  }
  await expect.poll(() => groups(page, "#content .lcol-tbl").then(g => g[M.a].count)).toBe("205");
  expect((await groups(page, "#content .lcol-tbl"))[M.a]).toMatchObject({ range: "176–200 of 205", on: "8" });
});

test("select mode: Select all takes every task the List holds, on every page; another page's rows come ticked; the check column still works", async ({ page }) => {
  await signIn(page);
  await show(page, "list");
  await page.evaluate(() => bulkToggle());
  await expect(page.locator("#content .lcol-tbl tbody tr[data-id] .bulk-check input")).toHaveCount(100);
  await page.locator("#bulkBar").getByRole("button", { name: "Select all" }).click();
  await expect(page.locator("#bulkBar b")).toHaveText(N + " selected");
  expect(await page.evaluate(ids => ids.every(id => ENH.bulkSel[id]), M.ids)).toBe(true);
  const pg = pagerOf(page);
  await pg.locator(".vpager-next").click();
  await expect(page.locator("#content .lcol-tbl tbody tr[data-id] .bulk-check input")).toHaveCount(100);
  await expect(page.locator("#content .lcol-tbl tbody tr[data-id] .bulk-check input:checked")).toHaveCount(100);
  await pageBtn(pg, 3).click();
  await expect(page.locator("#content .lcol-tbl tbody tr[data-id] .bulk-check input:checked")).toHaveCount(35);
  await expect(page.locator("#bulkBar b")).toHaveText(N + " selected");
  /* one taken off on page 3 is off when page 1 is shown and Select all is pressed again on page 1 */
  const off = (await listRows(page))[0];
  await page.locator('#content .lcol-tbl tr[data-id="' + off + '"] .bulk-check input').uncheck();
  await expect(page.locator("#bulkBar b")).toHaveText((N - 1) + " selected");
  await pageBtn(pg, 1).click();
  await page.locator("#bulkBar").getByRole("button", { name: "Select all" }).click();
  await expect(page.locator("#bulkBar b")).toHaveText(N + " selected");
  await page.evaluate(() => bulkToggle());
  /* the personal tick on a row of page 2 is on the task, and a redraw keeps it */
  await pageBtn(pagerOf(page), 2).click();
  const row = (await listRows(page))[50];
  await page.locator('#content .lcol-tbl tr[data-id="' + row + '"] .tcheck').click();
  await page.evaluate(() => renderScreen(false));
  await expect(page.locator('#content .lcol-tbl tr[data-id="' + row + '"]')).toHaveClass(/checked/);
  await page.evaluate(id => toggleTaskChecked(id), row);
});

test("drag-and-drop: a row on page 2 of a group moves onto another group's header; a row drops before another on its page; a drop reads the whole list's order", async ({ page }) => {
  await signIn(page);
  await show(page, "list", { group: "status" });
  await pageBtn(pagerOf(page, M.an), 2).click();
  const inA = await inGroup(page, M.a);
  const id = (await groups(page, "#content .lcol-tbl"))[M.a].ids[24];   /* page 2's last, just above the next group */
  expect(id).toBe(inA[49]);
  try {
    await center(page.locator("#content .lcol-tbl tr.vpager-row").first());
    await page.locator('#content .lcol-tbl tr[data-id="' + id + '"] td.lcol-tags').dragTo(page.locator('#content .lcol-tbl tr.grp[data-group="' + M.b + '"]'));
    await expect.poll(() => page.evaluate(i => task(i).status, id)).toBe(M.b);
    await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.find(x => x.id === i).status), id)).toBe(M.b);
    await expect.poll(() => groups(page, "#content .lcol-tbl").then(g => g[M.a].count)).toBe("204");
    const g = await groups(page, "#content .lcol-tbl");
    expect(g[M.a]).toMatchObject({ count: "204", on: "2", range: "26–50 of 204" });
    expect(g[M.a].ids, "the redraw keeps the page shown").toEqual((await inGroup(page, M.a)).slice(25, 50));
    expect(g[M.b].count).toBe("31");
    expect(await inGroup(page, M.b)).toContain(id);
    /* under Manual sort a row on page 2, dropped on another, lands just before it */
    const a1 = g[M.a].ids, mover = a1[10], target = a1[6];
    await center(page.locator('#content .lcol-tbl tr[data-id="' + a1[8] + '"]'));
    await page.locator('#content .lcol-tbl tr[data-id="' + mover + '"] td.lcol-tags').dragTo(page.locator('#content .lcol-tbl tr[data-id="' + target + '"] td.lcol-proj'));
    await expect.poll(() => groups(page, "#content .lcol-tbl").then(x => x[M.a].ids.slice(5, 8))).toEqual([a1[5], mover, target]);
    /* dropped on the first row of the next group: the task before it is the last of the group above, which is not drawn
       (that group shows its page 2), as it was with every row drawn — the whole list's order, not the rows drawn */
    const g2 = await groups(page, "#content .lcol-tbl"), first = g2[M.b].ids[0], other = g2[M.b].ids[5];
    const lastOfA = (await inGroup(page, M.a)).slice(-1)[0];
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
  await expect(colA.locator(".vpager")).toHaveCount(0);
  await expect(colB.locator(".kcard[data-id]")).toHaveCount(30); await expect(colB.locator(".vpage")).toHaveCount(0);
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

test("a task on another page opens from a link, from search and from a notification; the List stays on its page", async ({ page }) => {
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
  await expect(pagerOf(page).locator(".vpager-range")).toHaveText("1–100 of 235");
  await page.evaluate(() => { NOTIFS = NOTIFS.filter(n => n.id !== "nt-vpg"); closePops(); closeDrawer(); });
  /* a link */
  await page.goto("/tasks?task=" + id); await ready(page);
  await expect(page.locator("#drawer .dr-title")).toHaveText(title);
  await show(page, "list");
  await page.evaluate(i => openTask(i), id);
  await expect(page.locator("#drawer .dr-title")).toHaveText(title);
  expect((await listRows(page)).length).toBe(100);
  await expect(pagerOf(page).locator(".vpager-range")).toHaveText("1–100 of 235");
});

test("Grid: 100 rows a page, the same pager; a cell on page 2 edits its task and the redraw keeps the page; grouped, 25 a group", async ({ page }) => {
  /* 100 Grid rows hold 500 selects, and the form-label observer (src/v29.js) checks every one after each change:
     on a busy machine a redraw here takes seconds, so the waits are long */
  test.setTimeout(150000);
  await signIn(page);
  await show(page, "grid");
  const rows = () => page.$$eval("#content table.gridv tbody tr[data-id]", r => r.map(x => x.getAttribute("data-id")));
  const all = await order(page);
  expect(await rows()).toEqual(all.slice(0, 100));
  const pg = pagerOf(page, null, "table.gridv");
  await expect(pg.locator(".vpager-range")).toHaveText("1–100 of 235");
  expect(await page.locator("#content table.gridv tr.vpager-row td").getAttribute("colspan")).toBe(String(2 + await page.evaluate(() => S.gridFields.length)));
  await page.evaluate(() => { window.__grid = document.querySelector("#content table.gridv"); });
  await pg.locator(".vpager-next").click();
  expect(await rows()).toEqual(all.slice(100, 200));
  expect(await page.evaluate(() => document.querySelector("#content table.gridv") === window.__grid)).toBe(true);
  expect(await focused(page)).toBe("next");
  const id = all[150];
  try {
    await page.locator('#content table.gridv tr[data-id="' + id + '"] select').filter({ has: page.locator('option[value="urgent"]') }).selectOption("high");
    await expect.poll(() => page.evaluate(i => task(i).prio, id), { timeout: 45000 }).toBe("high");
    await expect.poll(() => rows(), { timeout: 45000, message: "the redraw after the edit keeps the page shown" }).toEqual(all.slice(100, 200));
  } finally {
    await page.evaluate(i => setPrio(i, "medium"), id);
    await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.find(x => x.id === i).prio), id), { timeout: 45000 }).toBe("medium");
  }
  /* grouped, each group 25 a page, its header in sight (under the Grid's own sticky header) after a page change */
  await show(page, "grid", { group: "status" });
  let g = await groups(page, "#content table.gridv");
  expect(g[M.a]).toMatchObject({ count: "205", range: "1–25 of 205", nums: "1 2 3 4 5 … 9" }); expect(g[M.a].ids.length).toBe(25);
  expect(g[M.b]).toMatchObject({ count: "30", range: "1–25 of 30" });
  await pagerOf(page, M.an, "table.gridv").locator(".vpager-next").click();
  g = await groups(page, "#content table.gridv");
  expect(g[M.a]).toMatchObject({ range: "26–50 of 205", on: "2", ids: (await inGroup(page, M.a)).slice(25, 50) });
  expect(await page.evaluate(a => { const w = document.querySelector("#content table.gridv").closest(".tbl-wrap"), h = document.querySelector('#content table.gridv tr.grp[data-group="' + a + '"]'), th = document.querySelector("#content table.gridv thead th");
    return h.getBoundingClientRect().top >= th.getBoundingClientRect().bottom - 1 && h.getBoundingClientRect().bottom <= w.getBoundingClientRect().bottom; }, M.a), "the group's header shows in the Grid's box, under its header").toBe(true);
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
  await expect(more.locator(".vpage-n")).toHaveText("30 of 235 shown");
  await expect(more.locator(".vpage-btn")).toHaveText("Show 30 more");
  await expect(grid.locator(".vpager")).toHaveCount(0);
  await more.locator(".vpage-btn").click();
  expect(await drawn()).toEqual(inP.slice(0, 60));
  await expect(more.locator(".vpage-n")).toHaveText("60 of 235 shown");
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
  test("the List's cards get the same pager, compact: the range on a line of its own, ‹ and › at the two ends; a tap pages; nothing scrolls sideways", async ({ page }) => {
    await signIn(page);
    await show(page, "list");
    const all = await order(page);
    await expect(page.locator("#content .lcol-tbl tbody tr[data-id]")).toHaveCount(100);
    const row = page.locator("#content .lcol-tbl tr.vpager-row"), pg = pagerOf(page);
    await row.scrollIntoViewIfNeeded();
    await expect(pg.locator(".vpager-next")).toBeVisible();
    const box = await page.evaluate(() => { const r = document.querySelector("#content .lcol-tbl tr.vpager-row"), n = r.querySelector(".vpager"), b = r.getBoundingClientRect(), c = document.querySelector("#content .lcol-tbl tbody tr[data-id]").getBoundingClientRect();
      const q = s => n.querySelector(s).getBoundingClientRect();
      return { display: getComputedStyle(r).display, w: Math.round(b.width), cw: Math.round(c.width), sw: document.documentElement.scrollWidth, vw: innerWidth,
        words: getComputedStyle(n.querySelector(".vpager-txt")).display, rangeAbove: q(".vpager-range").bottom <= q(".vpager-next").top + 1,
        ends: [Math.round(q(".vpager-prev").left - b.left), Math.round(b.right - q(".vpager-next").right)], navRight: Math.round(n.getBoundingClientRect().right), tap: Math.round(q(".vpager-next").height) }; });
    expect(box.display).toBe("block"); expect(box.w).toBe(box.cw); expect(box.sw).toBeLessThanOrEqual(box.vw);
    expect(box.words, "Prev and Next are their arrows only").toBe("none");
    expect(box.rangeAbove, "the range line above the buttons").toBe(true);
    expect(box.ends[0]).toBeLessThan(16); expect(box.ends[1]).toBeLessThan(16);
    expect(box.navRight).toBeLessThanOrEqual(box.vw);
    expect(box.tap, "a finger's size").toBeGreaterThanOrEqual(32);
    await expect(pg.locator(".vpager-next")).toHaveAttribute("aria-label", "Next page");
    await pg.locator(".vpager-next").tap();
    await expect.poll(() => listRows(page)).toEqual(all.slice(100, 200));
    await expect(pg.locator(".vpager-range")).toHaveText("101–200 of 235");
    expect(await topInSight(page, "#content .lcol-tbl")).toBe(true);
    /* grouped: each group its own compact pager */
    await show(page, "list", { group: "status" });
    const pb = pagerOf(page, M.bn);
    await pb.scrollIntoViewIfNeeded();
    await pb.locator(".vpager-next").tap();
    const g = await groups(page, "#content .lcol-tbl");
    expect(g[M.b]).toMatchObject({ range: "26–30 of 30", on: "2" }); expect(g[M.b].ids.length).toBe(5);
    expect(g[M.a]).toMatchObject({ range: "1–25 of 205", on: "1" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
