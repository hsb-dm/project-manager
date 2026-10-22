/* A colleague's change redraws the screen without losing the reader's place (Oct 2026). Every task saved anywhere
   in the workspace redraws the board (the live board); the board jumped back to its first column and a long
   column to its top every few seconds, and a field being typed in Settings went back to what was saved — the SMTP
   password to empty, so Test connection sent none. Here a second browser is the colleague.
   Only a redraw of the same view keeps the place (Oct 2026): another project opened at the place the last one was
   scrolled to, its board and the page, because the places were measured after S already named the next one. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* projects with a long second column: 16 of each project's 24 tasks are in the second stage */
async function makeProjects(page, names) {
  return page.evaluate(async names => {
    const out = { projects: [], tasks: [] }, tag = Date.now();
    for (const n of names) {
      const name = n + " " + tag; await apiFetch("POST", "/api/projects", { name, status: "active", owner: ME, teams: [] });
      const id = (await apiFetch("GET", "/api/bootstrap")).projects.find(p => p.name === name).id; out.projects.push(id);
      for (let i = 0; i < 24; i++) out.tasks.push((await apiFetch("POST", "/api/tasks", { title: n + " task " + i, status: WS.workflow[i % 3 ? 1 : 0].id, prio: "medium", assignee: ME, assignees: [ME], proj: id })).id);
    }
    await reloadAll(); return out;
  }, names);
}
async function dropProjects(page, made) {
  await page.evaluate(async m => { for (const id of m.tasks) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); for (const id of m.projects) await apiFetch("DELETE", "/api/projects/" + id).catch(() => {}); }, made);
}
/* where the board, its columns and the page are */
const boardPlace = page => page.evaluate(() => {
  const k = document.querySelector("#content .kanban"), long = document.querySelector('#content .kcol[data-status="' + WS.workflow[1].id + '"] .kcol-body');
  return { project: S.projectId, left: k ? k.scrollLeft : null, top: long ? long.scrollTop : null, cols: [...document.querySelectorAll("#content .kcol-body")].map(c => c.scrollTop), page: appScrollTop() };
});
const scrollBoard = (page, o) => page.evaluate(o => {
  document.querySelector("#content .kanban").scrollLeft = o.left;
  document.querySelector('#content .kcol[data-status="' + WS.workflow[1].id + '"] .kcol-body').scrollTop = o.top;
  appScrollTop(o.page);
}, o);
const tablePlace = page => page.locator("#content .tbl-wrap").first().evaluate(el => [el.scrollTop, el.scrollLeft]);

test("a colleague's save keeps the board where it was scrolled, and what is typed in Settings", async ({ browser, page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await signIn(page);
  const ids = await page.evaluate(async () => {
    const out = [], st = WS.workflow[1].id;
    for (let i = 0; i < 22; i++) { const d = await apiFetch("POST", "/api/tasks", { title: "Live " + i, status: st, prio: "medium", assignee: ME, assignees: [ME] }); out.push(d.id); }
    await reloadAll(); return out;
  });
  const colleague = await (await browser.newContext()).newPage();
  await signIn(colleague);
  const change = async (id, title) => colleague.evaluate(async o => { const d = await apiFetch("GET", "/api/tasks/" + o.id); d.title = o.title; await apiFetch("PUT", "/api/tasks/" + o.id, d); }, { id, title });
  try {
    /* the board, scrolled sideways and down a long column */
    await page.evaluate(() => { S.taskView = "kanban"; S.taskScope = "all"; go("tasks"); });
    const board = page.locator("#content .kanban"), col = page.locator('#content .kcol[data-status="' + (await page.evaluate(() => WS.workflow[1].id)) + '"] .kcol-body');
    await expect(col.locator(".kcard").first()).toBeVisible();
    await board.evaluate(el => { el.scrollLeft = 260; });
    await col.evaluate(el => { el.scrollTop = 300; });
    const before = { left: await board.evaluate(el => el.scrollLeft), top: await col.evaluate(el => el.scrollTop) };
    expect(before.left, "the board can scroll sideways").toBeGreaterThan(100);
    expect(before.top, "the column can scroll down").toBeGreaterThan(100);
    /* a colleague renames a task: it shows here, and the board stays where it was */
    await change(ids[3], "Live 3 — renamed by a colleague");
    await expect(page.locator("#content .kcard", { hasText: "Live 3 — renamed by a colleague" })).toHaveCount(1, { timeout: 10000 });
    expect(await board.evaluate(el => el.scrollLeft), "sideways").toBe(before.left);
    expect(await col.evaluate(el => el.scrollTop), "down the column").toBe(before.top);

    /* the Grid's table, scrolled down and sideways (Oct 2026: only the app's own scrollers are measured now) */
    await page.evaluate(() => { S.taskView = "grid"; go("tasks", "grid"); });
    const table = page.locator("#content .tbl-wrap").first();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await table.evaluate(el => { el.scrollTop = 200; el.scrollLeft = 120; });
    const was = await table.evaluate(el => [el.scrollTop, el.scrollLeft]);
    expect(was[0], "the table scrolls down").toBeGreaterThan(100);
    await change(ids[5], "Live 5 — renamed while the Grid is scrolled");
    await expect(page.locator('#content .tbl-wrap input[value="Live 5 — renamed while the Grid is scrolled"]')).toHaveCount(1, { timeout: 10000 });
    expect(await page.locator("#content .tbl-wrap").first().evaluate(el => [el.scrollTop, el.scrollLeft]), "the table stays where it was").toEqual(was);
    await page.evaluate(() => { S.taskView = "kanban"; });

    /* Settings: the SMTP password being typed survives a colleague's save, and goes out with Test connection */
    await page.goto("/settings/notifications"); await ready(page);
    const sent = [];
    await page.route("**/api/mail/smtp/test", r => { sent.push(r.request().postDataJSON()); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, encryption: "STARTTLS", authenticated: true }) }); });
    await page.locator("#smtp_host").fill("smtp.gmail.com");
    await page.locator("#smtp_pass").fill("abcd efgh ijkl mnop");
    const renders = await page.evaluate(() => { window.__r = 0; const f = renderScreen; renderScreen = function () { window.__r++; return f.apply(this, arguments); }; return 0; });
    await change(ids[4], "Live 4 — renamed while the admin types");
    await expect.poll(() => page.evaluate(() => window.__r), { timeout: 10000 }).toBeGreaterThan(renders);
    await expect(page.locator("#smtp_pass")).toHaveValue("abcd efgh ijkl mnop");
    await expect(page.locator("#smtp_host")).toHaveValue("smtp.gmail.com");
    await expect(page.locator("#smtp_pass"), "still being typed in").toBeFocused();
    await page.locator("#smtpTestBtn").click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].pass).toBe("abcd efgh ijkl mnop");
    /* the admin's own redraw (another tab and back) starts from what is saved */
    await page.evaluate(() => { S.settingsTab = "profile"; renderScreen(false); S.settingsTab = "notifications"; renderScreen(false); });
    await expect(page.locator("#smtp_pass")).toHaveValue("");
  } finally {
    await colleague.close();
    await page.evaluate(async ids => { for (const id of ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, ids);
  }
});

test("another project opens at the top, on a desktop and on a phone; a colleague's change keeps the project's place, and Back puts the page where it was", async ({ browser, page }) => {
  await signIn(page);
  const made = await makeProjects(page, ["Scroll A", "Scroll B"]), [A, B] = made.projects;
  const colleague = await (await browser.newContext()).newPage();
  await signIn(colleague);
  try {
    for (const vp of [{ width: 1360, height: 860 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.evaluate(a => { S.projectTab = "board"; go("projects", a); }, A);
      await expect(page.locator("#content .kcard", { hasText: "Scroll A task 1" }).first()).toBeVisible();
      await scrollBoard(page, { left: 150, top: 300, page: 250 });
      const before = await boardPlace(page);
      expect(before.left, vp.width + ": the board scrolls sideways").toBeGreaterThan(100);
      expect(before.top, vp.width + ": the long column scrolls down").toBeGreaterThan(100);
      expect(before.page, vp.width + ": the page scrolls down").toBeGreaterThan(0);

      /* a colleague renames one of A's tasks: A is drawn again, and stays where it was */
      const renamed = "Scroll A renamed at " + vp.width;
      await colleague.evaluate(async o => { const d = await apiFetch("GET", "/api/tasks/" + o.id); d.title = o.title; await apiFetch("PUT", "/api/tasks/" + o.id, d); }, { id: made.tasks[4], title: renamed });
      await expect(page.locator("#content .kcard", { hasText: renamed })).toHaveCount(1, { timeout: 10000 });
      expect(await boardPlace(page), vp.width + ": a live change keeps A's place").toEqual(before);

      /* project B, opened from A (a link in a task, a comment or a message goes the same way), starts at the top */
      await page.evaluate(b => go("projects", b), B);
      await expect(page.locator("#content .kcard", { hasText: "Scroll B task 1" }).first()).toBeVisible();
      const b = await boardPlace(page);
      expect(b.project).toBe(B);
      expect([b.left, b.page], vp.width + ": B's board and page start at the top").toEqual([0, 0]);
      expect(b.cols.every(t => t === 0), vp.width + ": every column of B starts at its top: " + b.cols).toBe(true);

      /* scrolled in B, then Back to A: the page is where A was left (as Back always did), and B's board does not come along */
      await scrollBoard(page, { left: 300, top: 200, page: 120 });
      const bScrolled = await boardPlace(page);
      expect(bScrolled.left).toBeGreaterThan(100);
      await page.locator("#content .nav-context-back").click();
      await expect.poll(() => page.evaluate(() => S.projectId)).toBe(A);
      await expect(page.locator("#content .kcard", { hasText: "Scroll A task 1" }).first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => appScrollTop()), { message: vp.width + ": Back puts the page where A was left" }).toBe(before.page);
      const back = await boardPlace(page);
      expect(back.left, vp.width + ": B's sideways scroll is not carried back into A").toBe(0);
      expect(back.cols.every(t => t === 0), vp.width + ": nor B's column scroll: " + back.cols).toBe(true);
      await page.evaluate(() => go("home"));
    }
  } finally {
    await colleague.close();
    await page.setViewportSize({ width: 1360, height: 860 });
    await dropProjects(page, made);
  }
});

test("another view of the same place starts at the top; a filter or a sort keeps the place", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await signIn(page);
  const made = await makeProjects(page, ["Views"]), [P] = made.projects;
  const views = await page.evaluate(async p => {
    const out = [];
    for (const [name, sort] of [["Scroll view one", "manual"], ["Scroll view two", "status"]]) {
      const list = await apiFetch("POST", "/api/views", { name: name + " " + Date.now(), type: "grid", filters: Object.assign(emptyTaskFilters(), { proj: p }), sort, group: "", fields: S.gridFields.slice(), config: { scope: "all", sortDir: 1 } });
      out.push(list.find(v => v.name.indexOf(name) === 0).id);
    }
    await reloadAll(); return out;
  }, P);
  const scrollTable = () => page.locator("#content .tbl-wrap").first().evaluate(el => { el.scrollTop = 200; el.scrollLeft = 120; return [el.scrollTop, el.scrollLeft]; });
  try {
    /* the Tasks screen's Grid, the project's 24 tasks */
    await page.evaluate(p => { S.taskScope = "all"; S.filters = Object.assign(emptyTaskFilters(), { proj: p }); S.activeView = null; S.sort = "manual"; S.taskView = "grid"; go("tasks"); }, P);
    await expect(page.locator("#content .tbl-wrap tbody tr")).toHaveCount(24);
    const was = await scrollTable();
    expect(was[0], "the Grid scrolls down").toBeGreaterThan(100);
    expect(was[1], "and sideways").toBeGreaterThan(100);
    /* a sort and a filter on the same view keep the place */
    await page.evaluate(() => setSort("status"));
    expect(await tablePlace(page), "a sort keeps the place").toEqual(was);
    await page.evaluate(() => setFilter("prio", "medium"));
    await expect(page.locator("#content .tbl-wrap tbody tr")).toHaveCount(24);
    expect(await tablePlace(page), "a filter keeps the place").toEqual(was);

    /* a saved view is another view: it opens at the top, and so does the next one */
    await page.evaluate(id => applyView(id), views[0]);
    await expect.poll(() => page.evaluate(() => S.activeView)).toBe(views[0]);
    expect(await tablePlace(page), "a saved view opens at the top").toEqual([0, 0]);
    expect(await scrollTable()).toEqual(was);
    await page.evaluate(id => applyView(id), views[1]);
    await expect.poll(() => page.evaluate(() => S.activeView)).toBe(views[1]);
    expect(await tablePlace(page), "another saved view opens at the top").toEqual([0, 0]);
    /* a filter changed on a saved view lets the saved view go, and keeps the place: the list is the same one */
    expect(await scrollTable()).toEqual(was);
    await page.evaluate(() => setFilter("prio", "medium"));
    expect(await page.evaluate(() => S.activeView)).toBe(null);
    expect(await tablePlace(page), "a filter on a saved view keeps the place").toEqual(was);

    /* Grid, then List: another view, the List's table starts at its left (it scrolls sideways at this width) */
    await page.locator('#content .seg button[data-view="list"]').click();
    await expect(page.locator("#content .tbl-wrap .gridv")).toHaveCount(0);
    await expect(page.locator("#content .tbl-wrap").first()).toBeVisible();
    expect(await page.locator("#content .tbl-wrap").first().evaluate(el => el.scrollWidth > el.clientWidth), "the List scrolls sideways here").toBe(true);
    expect(await tablePlace(page), "the List starts at the top").toEqual([0, 0]);

    /* in a project: the Board scrolled, then the List and the Grid, then the List again, then the Board */
    await page.evaluate(p => { S.filters = emptyTaskFilters(); S.activeView = null; S.sort = "manual"; S.projectTab = "board"; go("projects", p); }, P);
    await expect(page.locator("#content .kcard", { hasText: "Views task 1" }).first()).toBeVisible();
    await scrollBoard(page, { left: 150, top: 300, page: 0 });
    expect((await boardPlace(page)).left).toBeGreaterThan(100);
    await page.locator('#content .ptabs [data-tab="list"]').click();
    await expect(page.locator("#content .kanban")).toHaveCount(0);
    expect(await tablePlace(page), "Board, then List: the List starts at the top").toEqual([0, 0]);
    await page.locator('#content .ptabs [data-tab="grid"]').click();
    await expect(page.locator("#content .tbl-wrap tbody tr")).toHaveCount(24);
    expect(await tablePlace(page), "the Grid starts at the top").toEqual([0, 0]);
    expect(await scrollTable()).toEqual(was);
    await page.locator('#content .ptabs [data-tab="list"]').click();
    await expect(page.locator("#content .tbl-wrap .gridv")).toHaveCount(0);
    expect(await tablePlace(page), "Grid, then List: the List starts at the top").toEqual([0, 0]);
    await page.locator('#content .ptabs [data-tab="board"]').click();
    const board = await boardPlace(page);
    expect([board.left, board.cols.every(t => t === 0)], "and the Board at its first column, each at its top").toEqual([0, true]);
  } finally {
    await page.evaluate(async views => { S.filters = emptyTaskFilters(); S.activeView = null; S.sort = "manual"; S.taskView = "kanban"; S.projectTab = "overview"; for (const id of views) await apiFetch("DELETE", "/api/views/" + id).catch(() => {}); }, views);
    await dropProjects(page, made);
  }
});
