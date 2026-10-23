/* Right-click on a task row opens the task's own menu (src/enhance.js taskCtxId, taskContextMenu). Since the October
   XSS fix the rows call openTask(taskIdFrom(this)) and carry the id in data-id, while the menu read openTask('<id>')
   from the onclick, so it opened on no List row, Kanban card or search result. Now the nearest data-id that is a task
   names it, and the onclick still does for the rows that name the task there (a dependency in the task panel).
   For every kind of task row (List, grouped List, Kanban, Grid, a Calendar chip, its "Next 14 days" and its "+ more"
   sheet, a Timeline label and bar, Home, search, a project's overview and its List, a dependency in the task panel):
   the menu opens at the pointer for that task and not the browser's, one of its actions works, and Esc closes only the
   menu (an open task panel or dialog stays). Assign…, Change status… and Remind me… open where the menu was, not in the
   page's corner. A text input, a select, a link, a selection, the List's header (its own menu), a group's header, a
   board column's header and a comment keep what they had; Shift+F10 or the menu key on a focused control in a row
   opens it under that control with the focus in it, and Esc gives the focus back; a phone has no such menu.
   The tasks and the project made here are deleted, and what was changed (Saved, Watch, the look) is put back.
   With TCM_SHOTS=<folder>, screenshots of the menu on a List row and a Kanban card, light and dark. */
const { test, expect } = require("@playwright/test");
const path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const OPEN = /(^|\s)open(\s|$)/;
const SHOTS = process.env.TCM_SHOTS || "";
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test.describe.serial("Right-click on a task row opens that task's menu", () => {
  let page, ctx, m;
  const errors = [];
  const tag = "tcm" + Date.now().toString(36);
  const menu = () => page.locator("#ctxMenu.open");
  const item = name => page.locator("#ctxMenu.open").getByRole("button", { name, exact: true });
  const state = () => page.evaluate(() => ({ drawer: document.getElementById("drawer").classList.contains("open"), task: document.getElementById("drawer").classList.contains("open") ? S.drawerTask : null, modal: document.getElementById("modalWrap").classList.contains("open"), screen: S.screen }));
  const view = (v, o) => page.evaluate(([v, t, o]) => { closePops(); closeModal(); closeDrawer(); S.search = ""; S.taskScope = "all"; S.group = (o && o.group) || ""; S.sort = "manual"; S.sortDir = 1; S.filters = Object.assign(emptyTaskFilters(), { tag: t }); ENH.bulk = false; if (v === "calendar") { S.calMode = "month"; S.calMonth = TODAY.getMonth(); S.calYear = TODAY.getFullYear(); S.calDay = 0; } go("tasks", v); }, [v, tag, o || null]);

  /* a right-click at a point inside the element (the left part, which no task panel covers); what the page did with it */
  async function rightClick(loc, dx) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    const x = Math.round(b.x + Math.min(dx || 24, b.width / 2)), y = Math.round(b.y + b.height / 2);
    await page.evaluate(() => { window.__cm = null; });
    await page.mouse.click(x, y, { button: "right" });
    const cm = await page.evaluate(() => window.__cm);
    expect(cm, "a contextmenu event reached the page").not.toBeNull();
    return { x, y, prevented: cm.prevented };
  }
  /* the open menu's box holds the point it was opened at (its corner is there, or it flipped / was kept on the screen) */
  async function near(at, name) {
    const r = await page.evaluate(() => document.querySelector("#ctxMenu.open, #entityPicker").getBoundingClientRect().toJSON());
    expect(at.x >= r.left - 14 && at.x <= r.right + 14 && at.y >= r.top - 14 && at.y <= r.bottom + 14, name + ": at the pointer (" + at.x + "," + at.y + " in " + Math.round(r.left) + "," + Math.round(r.top) + " " + Math.round(r.width) + "x" + Math.round(r.height) + ")").toBe(true);
    expect(r.top > 30 || at.y < 60, name + ": not in the page's top corner").toBe(true);
  }
  /* the task's menu, at the pointer, for the task it was opened on, and not the browser's */
  async function expectMenu(id, at, name) {
    await expect(menu(), name + ": the task's menu opens").toBeVisible();
    expect(at.prevented, name + ": not the browser's own menu").toBe(true);
    const got = await page.evaluate(() => ({ id: TASK_CTX && TASK_CTX.id, open: document.querySelector("#ctxMenu.open button").getAttribute("onclick") }));
    expect(got.id, name + ": for its own task").toBe(id);
    expect(got.open, name + ": Open opens that task").toContain('openTask("' + id + '")');
    await expect(item("Open"), name).toBeVisible();
    await expect(item("Change status…"), name).toBeVisible();
    await near(at, name);
    /* where it fits, its top left corner is at the pointer (6 px under it), as a menu of the system's */
    const c = await page.evaluate(() => { const r = document.getElementById("ctxMenu").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
    if (at.x + c.w + 12 <= c.vw && at.y + 6 + c.h + 8 <= c.vh) expect([Math.round(c.l - at.x), Math.round(c.t - at.y)], name + ": its corner at the pointer").toEqual([0, 6]);
  }
  /* no task menu, and the browser's own menu is left to show */
  async function browserMenu(loc, name, dx) {
    const at = await rightClick(loc, dx);
    expect(at.prevented, name + ": the browser's own menu").toBe(false);
    await expect(menu(), name + ": no task menu").toHaveCount(0);
  }
  /* Esc closes the menu and nothing else */
  async function escOnly(name) {
    const before = await state();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ctxMenu.open, #entityPicker"), name + ": Esc closes the menu").toHaveCount(0);
    expect(await state(), name + ": and nothing else").toEqual(before);
  }
  const serverTask = id => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
  const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    await page.locator("#au_email").fill(ADMIN.email);
    await page.locator("#au_pw").fill(ADMIN.pw);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await ready(page);
    m = await page.evaluate(async t => {
      const st = WS.workflow.filter(s => s.kind !== "closed"), pid = "p_tcm_" + t, ids = [];
      await apiFetch("POST", "/api/projects", { id: pid, name: "Menu " + t, status: "active", owner: ME, startDate: iso(-5), dueDate: iso(20) });
      /* four on one day: the month's cell shows three and "+1 more" */
      for (const n of ["Alpha", "Bravo", "Charlie", "Delta"]) ids.push((await apiFetch("POST", "/api/tasks", { title: n + " menu " + t, status: st[0].id, prio: "high", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], tags: [t], proj: pid, startDate: iso(-2), dueDate: iso(0) })).id);
      await reloadAll();
      /* Delta waits for Charlie: its panel lists Charlie under BLOCKED BY, a row that names Charlie in its onclick */
      addTaskDependency(ids[3], ids[2]);
      await apiFetch("POST", "/api/tasks/" + ids[3] + "/comments", { id: "cm_tcm_" + t, text: "Which logo do we use " + t + "?" });
      await reloadAll();
      return { pid, ids, to: st[1], saved: (myPrefs().saved || []).slice() };
    }, tag);
    await expect.poll(() => page.evaluate(x => (task(x[3]).dependencies || []).map(d => d.taskId), m.ids)).toEqual([m.ids[2]]);
    m.appearance = await page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME] || {}).prefs || {}).appearance || (d.ws.theme || {}).appearance || "light"));
    await page.evaluate(() => window.addEventListener("contextmenu", e => { window.__cm = { prevented: e.defaultPrevented }; }));
  });
  test.afterAll(async () => {
    await page.evaluate(async x => {
      try { closePops(); closeModal(); closeDrawer(); epClose(); } catch (e) {}
      if (x.themed) setAppearance(x.appearance);
      const p = myPrefs(); p.saved = x.saved; p.reminders = (p.reminders || []).filter(r => x.ids.indexOf(r.entityId) < 0); await saveMyPrefs();
      for (const id of x.ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      await apiFetch("DELETE", "/api/projects/" + x.pid).catch(() => {});
    }, m);
    const left = await page.evaluate(async x => { const out = []; for (const id of x.ids) if (await apiFetch("GET", "/api/tasks/" + id).then(() => true, () => false)) out.push(id); const b = await apiFetch("GET", "/api/bootstrap"); if ((b.projects || []).some(p => p.id === x.pid)) out.push(x.pid); return out; }, m);
    expect(left, "what this spec made is gone").toEqual([]);
    await ctx.close();
    expect(errors, "no errors in the page").toEqual([]);
  });

  test("List: a row's menu at the pointer; Change status… opens where the menu was and moves the task; Esc closes only the menu", async () => {
    await view("list");
    const cell = page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids[0] + '"] td.lcol-title');
    let at = await rightClick(cell);
    await expectMenu(m.ids[0], at, "List row");
    await shot("menu-list-light");
    await escOnly("List row");
    at = await rightClick(cell);
    await item("Change status…").click();
    await expect(page.locator("#ctxMenu.open .mh")).toHaveText("Change status");
    await near(at, "Change status…");
    await page.locator("#ctxMenu.open button", { hasText: m.to.name }).first().click();
    await expect(menu()).toHaveCount(0);
    await expect.poll(() => page.evaluate(id => task(id).status, m.ids[0])).toBe(m.to.id);
    await expect.poll(async () => (await serverTask(m.ids[0])).status, "saved").toBe(m.to.id);
  });

  test("grouped List: a row's menu, Watch and Unwatch; the group's header has none", async () => {
    await view("list", { group: "status" });
    const cell = page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids[1] + '"] td.lcol-title');
    let at = await rightClick(cell);
    await expectMenu(m.ids[1], at, "grouped List row");
    await escOnly("grouped List row");
    await rightClick(cell);
    await item("Watch").click();
    await expect.poll(() => page.evaluate(id => isWatching(id), m.ids[1])).toBe(true);
    await rightClick(cell);
    await item("Unwatch").click();
    await expect.poll(() => page.evaluate(id => isWatching(id), m.ids[1])).toBe(false);
    await browserMenu(page.locator("#content .lcol-tbl tbody tr.grp").first(), "a group's header");
  });

  test("Kanban: a card's menu; Assign… opens its picker where the menu was and assigns; a column's header has none", async () => {
    await view("kanban");
    const card = page.locator('#content .kcard[data-id="' + m.ids[1] + '"]');
    let at = await rightClick(card.locator(".kt"));
    await expectMenu(m.ids[1], at, "Kanban card");
    await shot("menu-kanban-light");
    await escOnly("Kanban card");
    at = await rightClick(card.locator(".kt"));
    await item("Assign…").click();
    await expect(page.locator("#entityPicker")).toBeVisible();
    await near(at, "Assign…");
    await escOnly("the Assign picker");
    await rightClick(card.locator(".kt"));
    await item("Assign…").click();
    await page.locator("#entityPicker .ep-search").fill("Admin");
    await page.locator("#entityPicker .ep-row", { hasText: "Admin" }).first().click();
    await expect(page.locator("#toasts .toast", { hasText: "Assigned to Admin" })).toBeVisible();
    await browserMenu(page.locator("#content .kcol-head").first(), "a board column's header");
  });

  test("Grid: a row's menu, Save and Unsave; its text input and its select keep the browser's menu", async () => {
    await view("grid");
    const row = page.locator('#content .gridv tbody tr[data-id="' + m.ids[0] + '"]');
    let at = await rightClick(row.locator("td.drag-h"), 8);
    await expectMenu(m.ids[0], at, "Grid row");
    await escOnly("Grid row");
    await rightClick(row.locator("td.drag-h"), 8);
    await item("Save").click();
    await expect.poll(() => page.evaluate(id => isSaved("task", id), m.ids[0])).toBe(true);
    await rightClick(row.locator("td.drag-h"), 8);
    await item("Unsave").click();
    await expect.poll(() => page.evaluate(id => isSaved("task", id), m.ids[0])).toBe(false);
    await browserMenu(row.locator("input").first(), "the Grid's title input");
    await browserMenu(row.locator("select").first(), "a Grid select");
  });

  test("Calendar: a chip's menu opens the task; Next 14 days with Remind me…; the + more sheet over its dialog", async () => {
    await view("calendar");
    const chip = page.locator("#content .cal .chip[data-id]");
    await expect(chip).toHaveCount(3);
    const a = await chip.nth(0).getAttribute("data-id");
    let at = await rightClick(chip.nth(0));
    await expectMenu(a, at, "Calendar chip");
    await escOnly("Calendar chip");
    at = await rightClick(chip.nth(0));
    await item("Open").click();
    await expect(page.locator("#drawer")).toHaveClass(OPEN);
    expect(await page.evaluate(() => S.drawerTask)).toBe(a);
    await page.evaluate(() => closeDrawer());

    /* Next 14 days: Remind me… opens its menu where the task's menu was; Esc closes it alone and sets nothing */
    const agenda = page.locator('#content .agenda .row.dated[data-id="' + m.ids[2] + '"]');
    at = await rightClick(agenda);
    await expectMenu(m.ids[2], at, "Next 14 days row");
    await item("Remind me…").click();
    await expect(page.locator("#ctxMenu.open .mh")).toHaveText("Remind me");
    await near(at, "Remind me…");
    await escOnly("the Remind me menu");
    expect(await page.evaluate(id => reminders().filter(r => r.entityId === id).length, m.ids[2])).toBe(0);

    /* "+1 more": its sheet's rows have the menu over the dialog; Esc leaves the dialog; Open closes it and opens the task */
    await page.locator("#content .cal .chip.more").click();
    await expect(page.locator("#modalWrap")).toHaveClass(OPEN);
    const sheet = page.locator("#modalWrap .cal-more-list .task-row[data-id]");
    await expect(sheet).toHaveCount(4);
    const c = await sheet.nth(3).getAttribute("data-id");
    at = await rightClick(sheet.nth(3));
    await expectMenu(c, at, "the + more sheet's row");
    await escOnly("the + more sheet's row");
    await rightClick(sheet.nth(3));
    await item("Open").click();
    await expect(page.locator("#modalWrap")).not.toHaveClass(OPEN);
    await expect(page.locator("#drawer")).toHaveClass(OPEN);
    expect(await page.evaluate(() => S.drawerTask)).toBe(c);
    await page.evaluate(() => closeDrawer());
  });

  test("Timeline: a task's label and its bar have the menu; Edit opens the task on its brief", async () => {
    await view("timeline");
    const row = page.locator('#content .tl-row[data-id="' + m.ids[0] + '"]');
    let at = await rightClick(row.locator(".tl-lbl"));
    await expectMenu(m.ids[0], at, "Timeline label");
    await escOnly("Timeline label");
    at = await rightClick(row.locator(".tl-bar"), 10);
    await expectMenu(m.ids[0], at, "Timeline bar");
    await escOnly("Timeline bar");
    await rightClick(row.locator(".tl-bar"), 10);
    await item("Edit").click();
    await expect(page.locator("#drawer")).toHaveClass(OPEN);
    expect(await page.evaluate(() => [S.drawerTask, S.drawerTab])).toEqual([m.ids[0], "brief"]);
    await page.evaluate(() => closeDrawer());
  });

  test("Home: a task row's menu, Copy link", async () => {
    await page.evaluate(() => { closePops(); go("home"); });
    const row = page.locator('#content .task-row[data-id="' + m.ids[0] + '"]').first();
    let at = await rightClick(row.locator(".t"));
    await expectMenu(m.ids[0], at, "Home row");
    await escOnly("Home row");
    await rightClick(row.locator(".t"));
    await item("Copy link").click();
    await expect(page.locator("#toasts .toast", { hasText: "Task link copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.evaluate(id => deepLink("task", id), m.ids[0]));
  });

  test("Search: a result's menu, Archive and Unarchive; selected text and the search box keep the browser's menu", async () => {
    await page.evaluate(t => { closePops(); document.getElementById("searchInput").value = t; onSearch(t); }, tag);
    const row = () => page.locator('#content .task-row[data-id="' + m.ids[2] + '"]').first();
    let at = await rightClick(row().locator(".t"));
    await expectMenu(m.ids[2], at, "search result");
    await escOnly("search result");
    await rightClick(row().locator(".t"));
    await item("Archive").click();
    await expect.poll(() => page.evaluate(id => !!task(id).hidden, m.ids[2])).toBe(true);
    await page.evaluate(t => onSearch(t), tag);
    await rightClick(row().locator(".t"));
    await item("Unarchive").click();
    await expect.poll(() => page.evaluate(id => !!task(id).hidden, m.ids[2])).toBe(false);
    await expect.poll(async () => !!(await serverTask(m.ids[2])).hidden, "saved").toBe(false);
    /* a selection being right-clicked: Copy is the browser's (selected here by the page: a drag on a row also clicks it, which opens the task) */
    await page.evaluate(id => { const t = document.querySelector('#content .task-row[data-id="' + id + '"] .t'), r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); }, m.ids[2]);
    expect(await page.evaluate(() => String(getSelection())), "the title is selected").toContain("Charlie");
    await browserMenu(row().locator(".t"), "selected text in a row", 20);
    await expect(page.locator("#drawer")).not.toHaveClass(OPEN);
    await page.evaluate(() => getSelection().removeAllRanges());
    await browserMenu(page.locator("#searchInput"), "the search box");
    await page.evaluate(() => { document.getElementById("searchInput").value = ""; onSearch(""); });
  });

  test("a project: its overview's open tasks (Open in new tab) and its List", async () => {
    await page.evaluate(pid => { closePops(); S.projectTab = "overview"; go("projects", pid); }, m.pid);
    const row = page.locator('#content .task-row[data-id="' + m.ids[1] + '"]').first();
    let at = await rightClick(row.locator(".t"));
    await expectMenu(m.ids[1], at, "a project's open task");
    await escOnly("a project's open task");
    await rightClick(row.locator(".t"));
    const [tab] = await Promise.all([ctx.waitForEvent("page"), item("Open in new tab").click()]);
    expect(tab.url(), "the task's link (the app turns #task= into its own address once it loads)").toContain("task=" + m.ids[1]);
    await tab.close();
    await page.evaluate(() => { S.projectTab = "list"; S.group = ""; renderScreen(false); });
    const cell = page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids[1] + '"] td.lcol-title');
    at = await rightClick(cell);
    await expectMenu(m.ids[1], at, "a project's List row");
    await escOnly("a project's List row");
    await page.evaluate(() => { S.projectTab = "overview"; });
  });

  test("the task panel: a dependency's row has the menu of the task it names, over the panel; a comment has none", async () => {
    await page.evaluate(id => { closePops(); go("home"); openTask(id); S.drawerTab = "brief"; renderDrawer(); }, m.ids[3]);
    const dep = page.locator('#drawer [data-tour="task-blocked-by"] .row', { hasText: "Charlie" });
    let at = await rightClick(dep);
    await expectMenu(m.ids[2], at, "a dependency's row");
    await escOnly("a dependency's row");
    await expect(page.locator("#drawer")).toHaveClass(OPEN);
    await page.evaluate(() => { S.drawerTab = "comments"; renderDrawer(); });
    await browserMenu(page.locator("#drawer").getByText("Which logo do we use " + tag + "?"), "a comment", 6);
    await page.evaluate(() => { S.drawerTab = "brief"; renderDrawer(); });
    await rightClick(dep);
    await item("Open").click();
    expect(await page.evaluate(() => S.drawerTask)).toBe(m.ids[2]);
    await page.evaluate(() => closeDrawer());
  });

  test("the List's header keeps its own menu; a link in a row keeps the browser's", async () => {
    await view("list");
    const at = await rightClick(page.locator('#content .lcol-tbl th[data-col="status"]'));
    expect(at.prevented).toBe(true);
    await expect(page.locator("#ctxMenu.open .lcol-hm button")).toHaveText(["Hide column", "Columns…"]);
    expect(await page.evaluate(() => !!document.querySelector("#ctxMenu.open .lcol-hm")), "the header's menu, not a task's").toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu()).toHaveCount(0);
    await page.evaluate(id => { const td = document.querySelector('#content .lcol-tbl tr[data-id="' + id + '"] td.lcol-title'), a = document.createElement("a"); a.href = "https://example.com/brief"; a.id = "tcmLink"; a.textContent = "the brief"; td.prepend(a); }, m.ids[0]);
    await browserMenu(page.locator("#tcmLink"), "a link in a row", 6);
    await page.evaluate(() => renderScreen(false));
  });

  test("keys: Shift+F10 and the menu key on a row's check box open the menu under it with the focus in it; Esc gives the focus back", async () => {
    await view("list");
    const box = page.locator('#content .lcol-tbl tr[data-id="' + m.ids[0] + '"] td.tcheck-col button');    for (const key of ["Shift+F10", "ContextMenu"]) {
      await box.focus();
      await page.keyboard.press(key);
      await expect(menu(), key).toBeVisible();
      expect(await page.evaluate(() => TASK_CTX.id), key).toBe(m.ids[0]);
      await expect(item("Open"), key + ": the focus in the menu").toBeFocused();
      const r = await box.boundingBox(), mr = await page.locator("#ctxMenu").boundingBox();
      expect(Math.abs(mr.x - r.x) < 3 && mr.y >= r.y + r.height && mr.y - (r.y + r.height) < 12, key + ": under the check box").toBe(true);
      await page.keyboard.press("Escape");
      await expect(menu()).toHaveCount(0);
      await expect(box, key + ": Esc gives the focus back").toBeFocused();
    }
    expect(await page.evaluate(id => taskChecked(id), m.ids[0]), "not ticked by the keys").toBe(false);
  });

  test("a phone has no right-click menu: a long-press's contextmenu leaves the row alone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await view("list");
      const row = page.locator('#content tr[data-id="' + m.ids[0] + '"], #content [data-id="' + m.ids[0] + '"]').first();
      await expect(row).toBeVisible();
      const prevented = await page.evaluate(id => { const el = document.querySelector('#content [data-id="' + id + '"]'), r = el.getBoundingClientRect(), e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 }); el.dispatchEvent(e); return e.defaultPrevented; }, m.ids[0]);
      expect(prevented).toBe(false);
      await expect(menu()).toHaveCount(0);
    } finally { await page.setViewportSize({ width: 1366, height: 900 }); }
  });

  test("dark: the menu on a List row and a Kanban card", async () => {
    test.skip(!SHOTS, "screenshots only with TCM_SHOTS");
    m.themed = true;
    await page.evaluate(() => setAppearance("dark"));
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
    await view("list");
    let at = await rightClick(page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids[0] + '"] td.lcol-title'));
    await expectMenu(m.ids[0], at, "List row, dark");
    await shot("menu-list-dark");
    await page.keyboard.press("Escape");
    await view("kanban");
    at = await rightClick(page.locator('#content .kcard[data-id="' + m.ids[1] + '"] .kt'));
    await expectMenu(m.ids[1], at, "Kanban card, dark");
    await shot("menu-kanban-dark");
    await page.keyboard.press("Escape");
    await page.evaluate(a => setAppearance(a), m.appearance);
  });
});
