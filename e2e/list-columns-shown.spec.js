/* Which of the List's columns show (src/list-columns.js). "Columns" next to Group opens a popover listing every column
   in its order, each with a box to show or hide it and buttons to move it; Task is always shown. Each change draws the
   table again at once while the popover stays open where it is, the focus on the control just used. A header's own
   menu (right-click, Shift+F10, the menu key) hides it. Hidden columns are not drawn, keep their place in the order,
   are kept for the person across reloads, and Show all / Reset columns bring them back; on a phone a hidden column is
   not on the card and the button is an icon that fits the toolbar. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const DEF = ["title", "status", "dependency", "team", "assignee", "proj", "prio", "start", "due", "effort", "tags"];
test.use({ viewport: { width: 1680, height: 900 } });
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const resetPrefs = page => page.evaluate(() => { closePops(); myPrefs().listCols = {}; return saveMyPrefs(); });
const showList = (page, tag, group) => page.evaluate(([t, g]) => { UI_LANG = "en"; S.taskScope = "all"; S.taskView = "list"; S.sort = "manual"; S.sortDir = 1; S.group = g || ""; S.filters = Object.assign(emptyTaskFilters(), { tag: t }); if (S.screen !== "tasks") go("tasks"); else renderScreen(false); }, [tag, group]);
const heads = page => page.$$eval("#content .lcol-tbl thead th[data-col]", ths => ths.map(t => t.getAttribute("data-col")));
const cells = (page, id) => page.$$eval('#content .lcol-tbl tr[data-id="' + id + '"] > td', tds => tds.map(td => (td.className.match(/lcol-(\w+)/) || [, td.className.split(" ")[0] || "?"])[1]));
const box = (page, sel) => page.locator(sel).first().boundingBox();
const saved = page => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => (b.people[ME].prefs || {}).listCols || null));
const pop = page => page.locator("#ctxMenu.open .lcol-pop");
const rows = page => page.$$eval("#ctxMenu .lcol-pr", r => r.map(x => x.getAttribute("data-k") + (x.classList.contains("off") ? "-" : "")));
const row = (page, k, a) => page.locator('#ctxMenu .lcol-pr[data-k="' + k + '"] [data-a="' + a + '"]');
const focused = page => page.evaluate(() => { const a = document.activeElement, r = a && a.closest(".lcol-pr"); return (r ? r.getAttribute("data-k") + ":" : "") + (a.getAttribute("data-a") || a.getAttribute("data-col") || a.textContent.trim()); });
const says = page => page.evaluate(() => { const b = document.querySelector("#content .lcol-cols"), c = b.querySelector(".lcol-cnt"); return [b.getAttribute("aria-label"), b.getAttribute("title"), b.querySelector(".lcol-cbl").textContent, c ? c.textContent : null, b.classList.contains("on")]; });
const menuOpen = page =>page.evaluate(() => document.getElementById("ctxMenu").classList.contains("open"));
async function makeTasks(page, tag, proj) {
  return page.evaluate(async ([t, p]) => {
    const st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), ids = [];
    for (const [i, title] of ["Alpha banner " + t, "Beta poster " + t, "Gamma reel " + t].entries()) {
      const d = await apiFetch("POST", "/api/tasks", Object.assign({ title, status: st[i === 2 ? 1 : 0], prio: "medium", assignee: ME, assignees: [ME], tags: [t] }, p ? { proj: p } : {}));
      TASKS.push(hTask(d)); ids.push(d.id);
    }
    return ids;
  }, [tag, proj || null]);
}
const dropTasks = (page, ids) => page.evaluate(list => Promise.all(list.map(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}))), ids);

test("the Columns popover hides, shows and moves columns while it stays open; Task stays; kept across a reload; Show all and Reset", async ({ page }) => {
  await signIn(page);
  const tag = "lcols" + Date.now().toString(36);
  await resetPrefs(page);
  const pid = await page.evaluate(async () => { const p = { id: uid("p"), name: "Columns check " + Date.now(), owner: ME, start: -4, due: 20, progress: 0, status: "active", tags: [], teams: [], team: [ME], description: "", brief: "", milestones: [], sort: PROJECTS.length + 1 }; PROJECTS.push(p); await persistProject(p, true); return p.id; });
  const ids = await makeTasks(page, tag, pid);
  try {
    await showList(page, tag);
    const btn = page.locator("#content .lcol-cols");
    await expect.poll(() => says(page)).toEqual(["Columns", "Columns", "Columns", null, false]);
    expect(await page.evaluate(() => document.querySelector("#content .lcol-cols").previousElementSibling.getAttribute("data-pill")), "next to Group").toBe("group");
    await expect(page.locator("#content .lcol-reset")).toBeHidden();
    await btn.click();
    await expect(pop(page)).toBeVisible();
    await expect(page.locator("#ctxMenu .lcol-ph b")).toHaveText("Columns");
    await expect(page.locator("#ctxMenu .lcol-ph span")).toHaveText("11 of 11 shown");
    expect(await rows(page)).toEqual(DEF);
    /* Task: checked, cannot be unchecked, says why */
    await expect(row(page, "title", "cb")).toBeChecked();
    await expect(row(page, "title", "cb")).toBeDisabled();
    await expect(page.locator('#ctxMenu .lcol-pr[data-k="title"] small')).toHaveText("always shown");
    await expect(row(page, "title", "up")).toBeDisabled();
    await expect(row(page, "tags", "dn")).toBeDisabled();
    expect(await focused(page), "the first box that can change has the focus").toBe("status:cb");
    /* from here on the popover is never closed, opened again or moved */
    await page.evaluate(() => { const m = document.getElementById("ctxMenu"); window.__flips = 0; new MutationObserver(r => { window.__flips += r.length; }).observe(m, { attributes: true, attributeFilter: ["class", "style"] }); window.__tbl = document.querySelector("#content .lcol-tbl"); });

    /* Status hidden: the table is drawn again at once without it, in the header, the cells and nowhere else */
    await row(page, "status", "cb").click();
    const noStatus = DEF.filter(k => k !== "status");
    expect(await heads(page)).toEqual(noStatus);
    expect(await cells(page, ids[0])).toEqual(["tcheck-col", "drag-h"].concat(noStatus));
    expect(await page.evaluate(() => document.querySelector("#content .lcol-tbl") !== window.__tbl && !document.querySelector("#content .lcol-tbl .lcol-status"))).toBe(true);
    await expect(page.locator("#ctxMenu .lcol-ph span")).toHaveText("10 of 11 shown");
    expect(await rows(page)).toEqual(["title", "status-"].concat(DEF.slice(2)));
    await expect(row(page, "status", "cb")).not.toBeChecked();
    expect(await focused(page), "the focus stays on the box just used").toBe("status:cb");
    await expect(page.locator("#lcolLive")).toHaveText("Status hidden");
    await expect.poll(() => says(page), "the button: its words, its tooltip, the count in a dot").toEqual(["Columns · 1 hidden", "Columns · 1 hidden", "Columns", "1", true]);
    await expect(page.locator("#content .lcol-reset")).toBeVisible();
    await expect.poll(() => saved(page)).toEqual({ hide: ["status"] });
    /* the keyboard: Down goes to the next row, Space hides it */
    await page.keyboard.press("ArrowDown");
    expect(await focused(page)).toBe("dependency:cb");
    await page.keyboard.press("Space");
    await expect(page.locator("#lcolLive")).toHaveText("Dependency hidden");
    expect(await focused(page)).toBe("dependency:cb");
    /* a click on the name works too */
    await page.locator('#ctxMenu .lcol-pr[data-k="tags"] label span').click();
    await expect.poll(() => says(page)).toEqual(["Columns · 3 hidden", "Columns · 3 hidden", "Columns", "3", true]);
    expect(await heads(page)).toEqual(["title", "team", "assignee", "proj", "prio", "start", "due", "effort"]);
    /* the table's least width counts the columns shown only */
    expect(await page.evaluate(() => { const t = document.querySelector("#content .lcol-tbl"), ks = [...t.querySelectorAll("thead th[data-col]")].map(x => x.getAttribute("data-col")); return [t.style.getPropertyValue("--tbl-min"), ks.reduce((s, k) => s + LIST_COL_W[k], LIST_COL_W.check + LIST_COL_W.drag) + "px"]; })).toEqual(["904px", "904px"]);

    /* Project up: one place in the whole order, which the table follows; the focus stays on that button */
    await row(page, "proj", "up").click();
    expect(await rows(page)).toEqual(["title", "status-", "dependency-", "team", "proj", "assignee", "prio", "start", "due", "effort", "tags-"]);
    expect(await heads(page)).toEqual(["title", "team", "proj", "assignee", "prio", "start", "due", "effort"]);
    expect(await focused(page)).toBe("proj:up");
    await expect(page.locator("#lcolLive")).toHaveText("Project: column 5 of 11");
    await page.keyboard.press("Enter");
    expect(await rows(page)).toEqual(["title", "status-", "dependency-", "proj", "team", "assignee", "prio", "start", "due", "effort", "tags-"]);
    expect(await focused(page)).toBe("proj:up");
    /* Alt+Down moves the focused row back down; Down alone goes to the next row's same button */
    await page.keyboard.press("Alt+ArrowDown");
    expect(await rows(page)).toEqual(["title", "status-", "dependency-", "team", "proj", "assignee", "prio", "start", "due", "effort", "tags-"]);
    await page.keyboard.press("ArrowDown");
    expect(await focused(page)).toBe("assignee:up");
    await expect.poll(() => saved(page)).toEqual({ order: ["title", "status", "dependency", "team", "proj", "assignee", "prio", "start", "due", "effort", "tags"], hide: ["status", "dependency", "tags"] });
    expect(await page.evaluate(() => [window.__flips, document.getElementById("ctxMenu").classList.contains("open")]), "the popover never closed, opened again or moved").toEqual([0, true]);

    /* Esc closes it, the focus back on the button; a click outside closes it too; the button opens and closes it */
    await page.keyboard.press("Escape");
    expect(await menuOpen(page)).toBe(false);
    expect(await page.evaluate(() => document.activeElement.classList.contains("lcol-cols"))).toBe(true);
    await btn.click(); await expect(pop(page)).toBeVisible();
    await page.locator("#content .pagehead h1").click();
    expect(await menuOpen(page)).toBe(false);
    await btn.click(); await expect(pop(page)).toBeVisible();
    await btn.click(); expect(await menuOpen(page)).toBe(false);

    /* sorting and grouping by a hidden column still work; the group rows span the columns shown */
    await page.evaluate(() => { S.sort = "status"; S.group = "status"; renderScreen(false); });
    const grp = await page.$$eval("#content .lcol-tbl tr.grp > td", tds => tds.map(td => td.colSpan));
    expect(grp.length).toBeGreaterThan(1); expect(new Set(grp)).toEqual(new Set([10]));
    expect(await page.locator("#content .lcol-tbl tbody tr[data-id]").count()).toBe(3);
    expect(await heads(page)).toEqual(["title", "team", "proj", "assignee", "prio", "start", "due", "effort"]);
    await page.evaluate(() => { S.sort = "manual"; S.group = ""; renderScreen(false); });

    /* a header moved by the keyboard passes over the hidden columns, which keep their places */
    await page.locator('#content .lcol-tbl th[data-col="team"]').focus();
    await page.keyboard.press("Alt+ArrowLeft");
    expect(await heads(page)).toEqual(["team", "title", "proj", "assignee", "prio", "start", "due", "effort"]);
    await expect(page.locator("#lcolLive")).toHaveText("Team: column 1 of 8");
    const order = ["team", "status", "dependency", "title", "proj", "assignee", "prio", "start", "due", "effort", "tags"];
    await expect.poll(() => saved(page)).toEqual({ order, hide: ["status", "dependency", "tags"] });

    /* kept after a reload, and in a project's List tab too */
    await page.reload(); await ready(page); await showList(page, tag);
    expect(await heads(page)).toEqual(["team", "title", "proj", "assignee", "prio", "start", "due", "effort"]);
    await expect.poll(() => says(page)).toEqual(["Columns · 3 hidden", "Columns · 3 hidden", "Columns", "3", true]);
    await page.evaluate(i => { S.projectTab = "list"; go("projects", i); }, pid);
    expect(await heads(page)).toEqual(["team", "title", "proj", "assignee", "prio", "start", "due", "effort"]);
    await expect.poll(() => says(page)).toEqual(["Columns · 3 hidden", "Columns · 3 hidden", "Columns", "3", true]);
    await showList(page, tag);

    /* ticked again, a column comes back where it was */
    await btn.click();
    await row(page, "status", "cb").click();
    expect(await heads(page)).toEqual(["team", "status", "title", "proj", "assignee", "prio", "start", "due", "effort"]);
    await expect(page.locator("#lcolLive")).toHaveText("Status shown");
    /* Show all: every column, the order kept; the focus goes to the next button, Show all having nothing left to do */
    await page.locator('#ctxMenu [data-a="all"]').click();
    expect(await heads(page)).toEqual(order);
    await expect(page.locator("#ctxMenu .lcol-ph span")).toHaveText("11 of 11 shown");
    await expect(page.locator("#lcolLive")).toHaveText("All columns shown");
    await expect(page.locator('#ctxMenu [data-a="all"]')).toBeDisabled();
    expect(await focused(page)).toBe("reset");
    await expect.poll(() => says(page)).toEqual(["Columns", "Columns", "Columns", null, false]);
    await expect.poll(() => saved(page)).toEqual({ order });
    /* Reset columns, in the popover: the usual order, everything shown, the popover still open */
    await row(page, "effort", "cb").click();
    await page.locator('#ctxMenu [data-a="reset"]').click();
    expect(await heads(page)).toEqual(DEF);
    expect(await rows(page)).toEqual(DEF);
    expect(await menuOpen(page)).toBe(true);
    await expect(page.locator('#ctxMenu [data-a="reset"]')).toBeDisabled();
    expect(await focused(page)).toBe("status:cb");
    await expect(page.locator("#content .lcol-reset")).toBeHidden();
    await expect.poll(() => saved(page)).toEqual({});
    await page.keyboard.press("Escape");
    /* the toolbar's Reset columns shows every column again too */
    await page.evaluate(() => { myPrefs().listCols = { hide: ["tags", "team"] }; renderScreen(false); });
    await page.locator("#content .lcol-reset").click();
    expect(await heads(page)).toEqual(DEF);

    /* Indonesian; a kept list naming Task or an unknown column still hides only what it can */
    await page.evaluate(() => { UI_LANG = "id"; myPrefs().listCols = { hide: ["status", "title", "bogus"] }; renderScreen(false); });
    expect(await heads(page)).toEqual(noStatus);
    await expect.poll(() => says(page)).toEqual(["Kolom · 1 disembunyikan", "Kolom · 1 disembunyikan", "Kolom", "1", true]);
    await btn.click();
    await expect(page.locator("#ctxMenu .lcol-ph span")).toHaveText("10 dari 11 tampil");
    await expect(page.locator('#ctxMenu .lcol-pr[data-k="title"] small')).toHaveText("selalu tampil");
    await expect(page.locator('#ctxMenu [data-a="all"]')).toHaveText("Tampilkan semua");
    await expect(page.locator('#ctxMenu [data-a="reset"]')).toHaveText("Atur ulang kolom");
    await row(page, "status", "cb").click();
    await expect(page.locator("#lcolLive")).toHaveText(await page.evaluate(() => tr("Status") + " ditampilkan"));
    await row(page, "tags", "cb").click();
    await expect(page.locator("#lcolLive")).toHaveText(await page.evaluate(() => tr("Tags") + " disembunyikan"));
  } finally {
    await resetPrefs(page);
    await dropTasks(page, ids);
    await page.evaluate(i => { UI_LANG = "en"; S.filters = emptyTaskFilters(); S.group = ""; S.sort = "manual"; return apiFetch("DELETE", "/api/projects/" + i).catch(() => {}); }, pid);
  }
});

test("a header's own menu hides its column (not Task's), opens the Columns popover, and comes from the keyboard too; dragging still moves", async ({ page }) => {
  await signIn(page);
  const tag = "lcolm" + Date.now().toString(36);
  await resetPrefs(page);
  const ids = await makeTasks(page, tag);
  try {
    await showList(page, tag);
    await page.evaluate(() => { window.__cm = null; document.addEventListener("contextmenu", e => { window.__cm = e.defaultPrevented; }); });
    /* right-click Status: Hide column, Columns… — and not the browser's own menu, and no sorting */
    await page.locator('#content .lcol-tbl th[data-col="status"]').click({ button: "right" });
    await expect(page.locator("#ctxMenu.open .lcol-hm button")).toHaveText(["Hide column", "Columns…"]);
    expect(await page.evaluate(() => [window.__cm, S.sort])).toEqual([true, "manual"]);
    await page.locator("#ctxMenu .lcol-hm button").first().click();
    expect(await heads(page)).toEqual(DEF.filter(k => k !== "status"));
    expect(await menuOpen(page)).toBe(false);
    await expect(page.locator("#lcolLive")).toHaveText("Status hidden");
    expect(await focused(page), "the header now in its place has the focus").toBe("dependency");
    await expect.poll(() => saved(page)).toEqual({ hide: ["status"] });
    /* Task's menu only opens the popover, on Task's row */
    await page.locator('#content .lcol-tbl th[data-col="title"]').click({ button: "right" });
    await expect(page.locator("#ctxMenu.open .lcol-hm button")).toHaveText(["Columns…"]);
    await page.locator("#ctxMenu .lcol-hm button").click();
    await expect(pop(page)).toBeVisible();
    expect(await focused(page)).toBe("title:dn");
    expect(await page.evaluate(() => { const m = document.getElementById("ctxMenu").getBoundingClientRect(), b = document.querySelector("#content .lcol-cols").getBoundingClientRect(); return m.top >= b.bottom && m.top - b.bottom < 12; }), "under the Columns button").toBe(true);
    await page.keyboard.press("Escape");
    expect(await menuOpen(page)).toBe(false);

    /* Shift+F10 on a focused header; Up and Down go between the two; Esc gives the header the focus back */
    await page.locator('#content .lcol-tbl th[data-col="team"]').focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.locator("#ctxMenu.open .lcol-hm")).toBeVisible();
    expect(await focused(page)).toBe("Hide column");
    await page.keyboard.press("ArrowDown"); expect(await focused(page)).toBe("Columns…");
    await page.keyboard.press("ArrowUp"); expect(await focused(page)).toBe("Hide column");
    await page.keyboard.press("Escape");
    expect(await menuOpen(page)).toBe(false);
    expect(await focused(page)).toBe("team");
    expect(await page.evaluate(() => S.sort), "the keys did not sort").toBe("manual");
    /* the menu key, then Enter on Hide column */
    await page.keyboard.press("ContextMenu");
    expect(await focused(page)).toBe("Hide column");
    await page.keyboard.press("Enter");
    expect(await heads(page)).toEqual(["title", "dependency", "assignee", "proj", "prio", "start", "due", "effort", "tags"]);
    expect(await focused(page)).toBe("assignee");
    /* Columns… from the keyboard: the popover with that column's box in focus */
    await page.keyboard.press("Shift+F10"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await expect(pop(page)).toBeVisible();
    expect(await focused(page)).toBe("assignee:cb");
    await page.keyboard.press("Escape");
    /* the keys themselves open it, not only the contextmenu event a browser may send after them */
    for (const k of [{ key: "F10", shiftKey: true }, { key: "ContextMenu" }]) {
      await page.evaluate(o => document.querySelector('#content .lcol-tbl th[data-col="tags"]').dispatchEvent(new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, o))), k);
      expect(await focused(page), k.key).toBe("Hide column");
      await page.keyboard.press("Escape");
      expect(await focused(page)).toBe("tags");
    }

    /* a header dragged over a hidden column: the shown ones move, each hidden one keeps its place; a click still sorts */
    const a = await box(page, '#content .lcol-tbl th[data-col="prio"]'), s = await box(page, '#content .lcol-tbl th[data-col="dependency"]');
    await page.mouse.move(a.x + a.width / 2 - 10, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + 8, s.y + s.height / 2, { steps: 12 });
    expect(await menuOpen(page), "no menu while dragging").toBe(false);
    await page.mouse.up();
    expect(await heads(page)).toEqual(["title", "prio", "dependency", "assignee", "proj", "start", "due", "effort", "tags"]);
    await expect(page.locator("#lcolLive")).toHaveText("Priority: column 2 of 9");
    await expect.poll(() => saved(page)).toEqual({ order: ["title", "status", "prio", "team", "dependency", "assignee", "proj", "start", "due", "effort", "tags"], hide: ["status", "team"] });
    await page.locator('#content .lcol-tbl th[data-col="due"] .lcol-lbl').click();
    expect(await page.evaluate(() => S.sort)).toBe("due");
    /* sized by the keyboard: the least width still counts the columns shown only, and Task takes the room left */
    await page.locator('#content .lcol-tbl th[data-col="proj"]').focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    const least = await page.evaluate(() => { const t = document.querySelector("#content .lcol-tbl"), ks = [...t.querySelectorAll("thead th[data-col]")].map(x => x.getAttribute("data-col")); return [t.style.getPropertyValue("--tbl-min"), ks.reduce((s, k) => s + listColWidth(k), LIST_COL_W.check + LIST_COL_W.drag) + "px", t.classList.contains("lcol-sized"), t.querySelector('th[data-col="title"]').style.width]; });
    expect(least[0]).toBe(least[1]); expect(least[2]).toBe(true); expect(least[3]).toBe("");

    /* Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; S.sort = "manual"; renderScreen(false); });
    await page.locator('#content .lcol-tbl th[data-col="tags"]').click({ button: "right" });
    await expect(page.locator("#ctxMenu.open .lcol-hm button")).toHaveText(["Sembunyikan kolom", "Kolom…"]);
    await page.keyboard.press("Escape");
  } finally {
    await resetPrefs(page);
    await dropTasks(page, ids);
    await page.evaluate(() => { UI_LANG = "en"; S.filters = emptyTaskFilters(); S.group = ""; S.sort = "manual"; renderScreen(false); });
  }
});

test.describe("small laptop", () => {
  test.use({ viewport: { width: 1024, height: 800 } });
  test("with columns hidden and Reset columns shown, the toolbar keeps one row, in English and Indonesian", async ({ page }) => {
    await signIn(page);
    try {
      for (const lang of ["en", "id"]) {
        const r = await page.evaluate(l => { UI_LANG = l; myPrefs().listCols = { hide: ["dependency", "start", "tags"] }; S.taskScope = "all"; S.taskView = "list"; if (S.screen !== "tasks") go("tasks"); else renderScreen(false);
          const els = [...document.querySelectorAll("#content .task-filter-toolbar :is(.task-toolbar-primary,.task-toolbar-sort,.task-toolbar-tail)>*")].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0), tops = els.map(e => e.getBoundingClientRect().top);
          return { spread: Math.max(...tops) - Math.min(...tops), reset: !!document.querySelector("#content .lcol-reset:not([hidden])"), word: getComputedStyle(document.querySelector("#content .lcol-cols .lcol-cbl")).display !== "none" }; }, lang);
        expect(r, lang).toMatchObject({ reset: true, word: true }); expect(r.spread, "one row in " + lang).toBeLessThan(10);
      }
    } finally { await page.evaluate(() => { UI_LANG = "en"; myPrefs().listCols = {}; return saveMyPrefs(); }); }
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the Columns button fits the toolbar as an icon, its popover fits the screen, and a hidden column is not on the card", async ({ page }) => {
    await signIn(page);
    const tag = "lcolsp" + Date.now().toString(36);
    await resetPrefs(page);
    const ids = await makeTasks(page, tag);
    try {
      const fit = () => page.evaluate(() => {
        const bar = document.querySelector("#content .task-filter-toolbar"), els = [...bar.querySelectorAll(".task-toolbar-primary>*,.task-toolbar-sort>*,.task-toolbar-tail>*")].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0);
        const b = els.map(e => e.getBoundingClientRect()), over = [];
        for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const w = Math.min(b[i].right, b[j].right) - Math.max(b[i].left, b[j].left), h = Math.min(b[i].bottom, b[j].bottom) - Math.max(b[i].top, b[j].top); if (w > 1 && h > 1) over.push(els[i].className + " / " + els[j].className); }
        const btn = document.querySelector("#content .lcol-cols"), c = btn.getBoundingClientRect(), inside = [...btn.children].every(x => { const r = x.getBoundingClientRect(); return !r.width || (r.left >= c.left - 5 && r.right <= c.right + 5); });
        return { over, sw: document.documentElement.scrollWidth, vw: innerWidth, rows: Math.max(...b.map(r => r.top)) - Math.min(...b.map(r => r.top)), cols: [Math.round(c.left), Math.round(c.right), Math.round(c.width)], icon: !btn.querySelector(".lcol-cbl").offsetWidth && inside };
      });
      for (const lang of ["en", "id"]) {
        await showList(page, tag);
        await page.evaluate(l => { UI_LANG = l; renderScreen(false); }, lang);
        const f = await fit();
        expect(f.over, "nothing overlaps in " + lang).toEqual([]);
        expect(f.sw, "no sideways scroll in " + lang).toBeLessThanOrEqual(f.vw);
        expect(f.rows, "one row in " + lang).toBeLessThan(8);
        expect(f.cols[0]).toBeGreaterThanOrEqual(0); expect(f.cols[1]).toBeLessThanOrEqual(f.vw); expect(f.cols[2]).toBeGreaterThanOrEqual(28);
        expect(f.icon, "an icon, nothing spilling out of the button, in " + lang).toBe(true);
      }
      await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
      const btn = page.locator("#content .lcol-cols");
      await expect(btn).toHaveAttribute("aria-label", "Columns");
      expect(await page.locator('#content tr[data-id="' + ids[0] + '"] td.lcol-team').count()).toBe(1);
      await btn.tap();
      await expect(pop(page)).toBeVisible();
      const p = await page.evaluate(() => { const r = document.getElementById("ctxMenu").getBoundingClientRect(); return [r.left, r.right, innerWidth, r.bottom, innerHeight]; });
      expect(p[0]).toBeGreaterThanOrEqual(0); expect(p[1]).toBeLessThanOrEqual(p[2]); expect(p[3]).toBeLessThanOrEqual(p[4]);
      await page.locator('#ctxMenu .lcol-pr[data-k="team"] label').tap();
      await expect(pop(page), "still open").toBeVisible();
      const card = await page.evaluate(id => { const r = document.querySelector('#content tr[data-id="' + id + '"]'); return { team: r.querySelectorAll("td.lcol-team").length, status: r.querySelectorAll("td.lcol-status").length, title: !!r.querySelector("td.lcol-title") }; }, ids[0]);
      expect(card).toEqual({ team: 0, status: 1, title: true });
      await expect(btn).toHaveAttribute("aria-label", "Columns · 1 hidden");
      await expect(page.locator("#content .lcol-cols .lcol-cnt")).toHaveText("1");
      await expect(page.locator("#content .lcol-cols .lcol-cnt")).toBeVisible();
      const f = await fit();
      expect(f.over).toEqual([]); expect(f.sw).toBeLessThanOrEqual(f.vw); expect(f.icon).toBe(true);
      await expect.poll(() => saved(page)).toEqual({ hide: ["team"] });
    } finally {
      await resetPrefs(page);
      await dropTasks(page, ids);
      await page.evaluate(() => { UI_LANG = "en"; S.filters = emptyTaskFilters(); renderScreen(false); });
    }
  });
});
